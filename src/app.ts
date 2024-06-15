import express from "express";
import cors from "cors";
import redisClient from "./db/redisdb";
import { PrismaClient } from "@prisma/client";
import { InviteInfo, LottoInfo, LottoInfoinRedis, LottoandChipsInfo, RankingPageInfo, RankingUserInfo, UserDataInfo, UserDataInfoRank, UserInfo, UserTest, taskCompletion, topPointsUsers } from "./types";
import { checkIfTimeIsToday, invitationCodeGenerator, lottoGenerator } from "./utils/utilfunc";
import { isoTimeExample, lottoInfoinRedisExampleJson } from "./utils/example";
import responseMiddleware from "./middlewares/responseMiddleware";
import dotenv from 'dotenv';
import authMiddleware, { getInitData } from "./middlewares/authMiddleware";
import { User } from "@tma.js/init-data-node";
import { Bot, InlineKeyboard } from "grammy";
dotenv.config();

const PORT = process.env.PORT || 3000;
// Bot实例
const bot = new Bot(process.env.BOT_TOKEN!);

// Bot对/start指令的回复
bot.command("start", async (ctx) => {
    const inlineKeyboard = new InlineKeyboard()
        .url("Play Lotto Now", process.env.TMA_Link!)
        .row()
        .url("Join Our Community", process.env.Channel_Link!)
        .row()
        .url("Follow Our X", process.env.Twitter_Link!);
    
    await ctx.reply("Test", {
        reply_markup: inlineKeyboard
    });
});

bot.catch((err) => {
    console.error('Error in bot:', err);
});

// Bot启动
bot.start();

const app = express();
// 使用三个中间件，用于资源跨域请求以及解析HTTP JSON数据
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(responseMiddleware);

redisClient.on('ready', () => console.log('Redis Client is Ready'));
redisClient.connect()   // 连接Redis

const prisma = new PrismaClient();

// 进入游戏返回用户信息
// 注意我会返回两种类型中的一个：string用作错误提示，UserDataInfo用作用户信息
// 前端在query中包含的是invitation_code
app.get("/user", authMiddleware, async (req, res) => {
    // 获取请求头中的用户信息
    const initData = getInitData(res)!

    const { id, username, isPremium } = initData.user!
    const user_telegram_id = String(id);
    const is_premium = Boolean(isPremium);

    // 这里的邀请码是指该用户点击的邀请码，而不是属于他的邀请码
    const invitation_code = String(req.query.invitation_code);

    // 从MySQL获取用户信息
    const user = await prisma.users.findUnique({
        where: {
            user_telegram_id: user_telegram_id
        }
    });

    let isNewUser = false;
    let userInvitationCode = user?.invitation_code;

    // 检查用户是否是新用户
    if (user) {
        // 若前端传入的is_premium值与MySQL中记录的is_premium不同，则更新MySQL中的值
        if (user.is_premium !== is_premium) {
            const updataUserIsPremium = await prisma.users.update({
                where: {
                    user_telegram_id: user_telegram_id
                },
                data: {
                    is_premium: is_premium
                }
            })
        }
    } else {
        const placeholder: string = "";

        // 组装要存入MySQL的用户数据
        const user: UserInfo = {
            user_telegram_id: user_telegram_id,
            username: username!,
            is_premium: is_premium,
            // 首次将用户信息存入MySQL时，邀请码这一个字段先置为空字符串
            invitation_code: placeholder
        }

        // 向MySQL用户信息表里存入数据
        const newUser = await prisma.users.create({
            data: user
        })

        // 获取自增id
        const mysql_id: number = Number(newUser.id);

        // 根据MySQL的自增id生成邀请码
        const user_invitation_code: string = invitationCodeGenerator(mysql_id);

        isNewUser = true;
        userInvitationCode = user_invitation_code;

        // 更新MySQL的Users数据表
        // 因为用了两步操作数据库，所以前端尽量在收到或使用invitation_code信息的时候加入是否为空字符串的校验
        const updataUserInvitationCode = await prisma.users.update({
            where: {
                user_telegram_id: user_telegram_id
            },
            data: {
                invitation_code: user_invitation_code
            }
        })

        // 检查前端传递的用户信息中是否有邀请码信息
        if (invitation_code !== "undefined") {
            const invited_info: InviteInfo = {
                invitation_code: invitation_code,
                invited_user_telegram_id: user_telegram_id,
                is_premium: is_premium
            };

            const newInvite = await prisma.inviteRecord.create({
                data: invited_info
            });

            // 获取邀请码所有者的Telegram_ID
            const InvitationCodeOwner = await prisma.users.findUnique({
                where: {
                    invitation_code: invitation_code
                }
            });

            // 检测被邀请用户是否是Premium会员，如果是的话则奖励增多
            if (is_premium) {
                // 在Redis中增加邀请者的筹码数
                // 判断获取到的邀请码所有者信息是否为空
                if (InvitationCodeOwner) {
                    await redisClient.incrBy(`user_chips_${InvitationCodeOwner.user_telegram_id}`, 2000);
                } else {
                    res.error("Invitaion Code Owner Information is empty!");
                }

                // 在Redis中初始化用户筹码信息
                await redisClient.set(`user_chips_${user_telegram_id}`, 2000);
            } else {
                // 在Redis中增加邀请者的筹码数
                // 判断获取到的邀请码所有者信息是否为空
                if (InvitationCodeOwner) {
                    await redisClient.incrBy(`user_chips_${InvitationCodeOwner.user_telegram_id}`, 1000);
                } else {
                    res.error("Invitaion Code Owner Information is empty!");
                }

                // 在Redis中初始化用户筹码信息
                await redisClient.set(`user_chips_${user_telegram_id}`, 1000);
            }

            await redisClient.zAdd("user_points", [{ score: 0, value: user_telegram_id }]);
            await redisClient.set(`user_lotto_number_${user_telegram_id}`, 0);
            await redisClient.set(`user_lotto_win_number_${user_telegram_id}`, 0);
            // 别忘了初始化最新刮刮乐信息、最新邀请任务记录、最新Checkin任务记录
            await redisClient.set(`user_newest_lotto_${user_telegram_id}`, lottoInfoinRedisExampleJson);
            await redisClient.set(`user_daily_checkin_task_${user_telegram_id}`, isoTimeExample);
            await redisClient.set(`user_daily_invite_task_${user_telegram_id}`, isoTimeExample);
        } else {
            // 在Redis中初始化用户信息
            await redisClient.set(`user_chips_${user_telegram_id}`, 0);
            await redisClient.zAdd("user_points", [{ score: 0, value: user_telegram_id }]);
            await redisClient.set(`user_lotto_number_${user_telegram_id}`, 0);
            await redisClient.set(`user_lotto_win_number_${user_telegram_id}`, 0);
            // 别忘了初始化最新刮刮乐信息、最新邀请任务记录、最新Checkin任务记录
            await redisClient.set(`user_newest_lotto_${user_telegram_id}`, lottoInfoinRedisExampleJson);
            await redisClient.set(`user_daily_checkin_task_${user_telegram_id}`, isoTimeExample);
            await redisClient.set(`user_daily_invite_task_${user_telegram_id}`, isoTimeExample);
        }
    }

    // 从Redis中获取数据
    const user_chips = await redisClient.get(`user_chips_${user_telegram_id}`);
    const user_points = await redisClient.zScore("user_points", user_telegram_id);
    // 注意排名是从0开始的，需要给排名+1
    const user_ranking = await redisClient.zRevRank("user_points", user_telegram_id);

    const userDataInfo: UserDataInfo & {
        invitation_code?: string
        is_new?: boolean
    } = {
        chips: Number(user_chips),
        points: Number(user_points),
        ranking: Number(user_ranking) + 1,
        invitation_code: userInvitationCode,
        is_new: isNewUser
    }

    res.success(userDataInfo)

    /** 测试
    const lotto_number = await redisClient.get(`user_lotto_number_${user_telegram_id}`);
    const lotto_win_number = await redisClient.get(`user_lotto_win_number_${user_telegram_id}`);
    const newest_lotto = await redisClient.get(`user_newest_lotto_${user_telegram_id}`);
    const daily_checkin = await redisClient.get(`user_daily_checkin_task_${user_telegram_id}`);
    const daily_checkin_date: Date = new Date(daily_checkin!);
    const daily_invite = await redisClient.get(`user_daily_invite_task_${user_telegram_id}`);
    const daily_invite_date = new Date(daily_invite!);

    const userTest: UserTest = {
        invitation_code: invitation_code,
        is_premium: is_premium,
        chips: Number(user_chips),
        points: Number(user_points),
        ranking: Number(user_ranking) + 1,
        lotto_number: Number(lotto_number),
        lotto_win_number: Number(lotto_win_number),
        newest_lotto: JSON.parse(newest_lotto!),
        daily_checkin: daily_checkin_date,
        daily_invite: daily_invite_date

    }
   
    res.success(userTest);
    */
});


// 进入彩票页面检查是否有没刮完的彩票
// 返回类型是从下面两种类型中选择一个：string用来标识数据获取出错，boolean用来标识该用户是否有未刮完的彩票
app.get("/lotto/check", authMiddleware, async (req, res) => {
    // 获取请求头中的用户信息
    const initData = getInitData(res)!

    // 从req.header解析出来的常量
    const { id } = initData.user!
    const user_telegram_id = String(id);
    const lotto_record = await redisClient.get(`user_newest_lotto_${user_telegram_id}`);

    if (lotto_record) {
        // 用一个新变量存储解析后的JSON数据
        const lotto_record_json: LottoInfoinRedis = JSON.parse(lotto_record);
        const lotto_done: boolean = lotto_record_json.done;
        res.success(!lotto_done);
    } else {
        // res.error("Lottery Record meets some errors");
        res.success(false);
    }
});


// 彩票游戏开始
// 我会返回两种类型中的一种：string用于提示筹码是否足够以及一些数据获取的错误，LottoandChipsInfo用来记录彩票信息和用户筹码信息
app.get("/lotto/start", authMiddleware, async (req, res) => {
    // 获取请求头中的用户信息
    const initData = getInitData(res)!

    // 从req.header解析出来的常量
    const { id } = initData.user!
    const user_telegram_id = String(id);

    // 在Redis中查找用户的筹码数
    const user_chips = await redisClient.get(`user_chips_${user_telegram_id}`);

    // 检查用户筹码数是否可以买刮刮乐
    if (Number(user_chips) >= 100) {
        const lotto_record = await redisClient.get(`user_newest_lotto_${user_telegram_id}`);
        if (lotto_record) {
            // 用一个新变量存储解析后的JSON数据
            const lotto_record_json: LottoInfoinRedis = JSON.parse(lotto_record);
            const lotto_done: boolean = lotto_record_json.done;

            // 检查之前生成的彩票是否被刮完
            if (lotto_done) {
                // 生成彩票信息
                const lottoInfo: LottoInfo = lottoGenerator();

                // TODO: 是不是没什么必要存在MySQL中
                // 记录当前时间
                const now = new Date();
                // 组装要存入Redis的数据
                const lottoInfoRedis: LottoInfoinRedis = {
                    lottoInfo: lottoInfo,
                    bought_at: now,
                    done: false
                }
                // 将对象序列化为JSON字符串
                const lottoInfoJson: string = JSON.stringify(lottoInfoRedis);
                // 存入Redis
                await redisClient.set(`user_newest_lotto_${user_telegram_id}`, lottoInfoJson);

                // 将用户的筹码数-100
                await redisClient.decrBy(`user_chips_${user_telegram_id}`, 100);
                // 获取用户当前筹码数
                const user_chips = await redisClient.get(`user_chips_${user_telegram_id}`);

                // 组装要发给前端的数据
                const lottoandChipsInfo: LottoandChipsInfo = {
                    is_remain: false,
                    lottoInfo: lottoInfo,
                    chips: Number(user_chips)
                }

                res.success(lottoandChipsInfo);
            } else {
                const lottoInfo: LottoInfo = lotto_record_json.lottoInfo;
                // 获取用户当前筹码数
                const user_chips = await redisClient.get(`user_chips_${user_telegram_id}`);

                // 组装要发给前端的数据
                const lottoandChipsInfo: LottoandChipsInfo = {
                    is_remain: true,
                    lottoInfo: lottoInfo,
                    chips: Number(user_chips)
                }

                res.success(lottoandChipsInfo);
            }
        } else {
            res.error("Lottery Record meets some errors");
        }
    } else {
        res.error(`user ${user_telegram_id} doesn't have enough chips for a lotto`);
    }

});

// 彩票游戏开奖
// 注意，我会返回两种数据类型中的一个：string用于标明数据获取的错误，UserDataInfo用于指明用户筹码、积分、排名信息。
app.post("/lotto/end", authMiddleware, async (req, res) => {
    // 获取请求头中的用户信息
    const initData = getInitData(res)!

    // 从req.header解析出来的常量
    const { id } = initData.user!
    const user_telegram_id = String(id);

    // 获取当前用户最近一次彩票信息
    const lotto_record = await redisClient.get(`user_newest_lotto_${user_telegram_id}`);
    if (lotto_record) {
        // 用一个新变量存储解析后的JSON数据，修改done字段为true
        const lotto_record_json: LottoInfoinRedis = JSON.parse(lotto_record);
        const rewards = lotto_record_json.lottoInfo.rewards;
        lotto_record_json.done = true;
        const new_lotto_record = JSON.stringify(lotto_record_json);

        // 将修改后的数据存入Redis
        await redisClient.set(`user_newest_lotto_${user_telegram_id}`, new_lotto_record);

        // 检查是否中奖
        if (rewards > 0) {
            // 用户积分数增加rewards
            const old_user_points = await redisClient.zScore("user_points", user_telegram_id);
            const new_user_points = Number(old_user_points) + rewards;
            await redisClient.zAdd("user_points", [{ score: new_user_points, value: user_telegram_id }]);

            // 用户中彩票数+1
            await redisClient.incrBy(`user_lotto_win_number_${user_telegram_id}`, 1);
        }

        // 用户刮彩票数+1
        await redisClient.incrBy(`user_lotto_number_${user_telegram_id}`, 1);

        // 从Redis中获取数据
        const user_chips = await redisClient.get(`user_chips_${user_telegram_id}`);
        const user_points = await redisClient.zScore("user_points", user_telegram_id);
        // 注意排名是从0开始的，需要给排名+1
        const user_ranking = await redisClient.zRevRank("user_points", user_telegram_id);

        const userDataInfo: UserDataInfo = {
            chips: Number(user_chips),
            points: Number(user_points),
            ranking: Number(user_ranking) + 1
        }

        res.success(userDataInfo);
    } else {
        res.error("Lottery Record meets some errors");
    }
});

// 进入任务界面检查任务完成情况
app.get("/task/check", authMiddleware, async (req, res) => {
    // 获取请求头中的用户信息
    const initData = getInitData(res)!

    // 从req.header解析出来的常量
    const { id } = initData.user!
    const user_telegram_id = String(id);

    let premium: boolean = false;
    let join_our_channel: boolean = false;
    let follow_our_x: boolean = false;
    let daily_checkin: boolean = false;
    let daily_invite: boolean = false;
    let daily_lotto: boolean = false;

    // 检查premium任务完成情况
    const premiumRecord = await prisma.premiumTaskRecord.findUnique({
        where: {
            user_telegram_id: user_telegram_id
        }
    });

    if (premiumRecord) {
        premium = true;
    }

    // 检查join_our_channel任务完成情况
    const joinOurChannelRecord = await prisma.tGChannelTaskRecord.findUnique({
        where: {
            user_telegram_id: user_telegram_id
        }
    });

    if (joinOurChannelRecord) {
        join_our_channel = true;
    }

    // 检查follow_our_x任务完成情况
    const followOurXRecord = await prisma.followXTaskRecord.findUnique({
        where: {
            user_telegram_id: user_telegram_id
        }
    });

    if (followOurXRecord) {
        follow_our_x = true;
    }

    // 检查daily_checkin任务完成情况
    // 从Redis中取出最新一次checkin任务完成的时间
    const dailyCheckinTime = await redisClient.get(`user_daily_checkin_task_${user_telegram_id}`);
    if (checkIfTimeIsToday(String(dailyCheckinTime))) {
        daily_checkin = true;
    }

    // 检查daily_invite任务完成情况
    // 从Redis中取出最新一次daily invite任务完成的时间
    const dailyInviteTime = await redisClient.get(`user_daily_invite_task_${user_telegram_id}`);
    if (checkIfTimeIsToday(String(dailyInviteTime))) {
        daily_invite = true;
    }

    // 检查daily_lotto任务完成情况
    // 获取当前用户最近一次彩票信息
    const lotto_record = await redisClient.get(`user_newest_lotto_${user_telegram_id}`);
    if (lotto_record) {
        // 用一个新变量存储解析后的JSON数据
        const lotto_record_json: LottoInfoinRedis = JSON.parse(lotto_record);
        // JSON.parse只会将日期字符串解析为字符串类型
        const dailyLottoTime: Date = new Date(lotto_record_json.bought_at);
        const dailyLottoTimeIso: string = dailyLottoTime.toISOString();
        if (checkIfTimeIsToday(dailyLottoTimeIso)) {
            daily_lotto = true;
        }
    } else {
        res.error("Lotto Record meets some errors");
    }

    const taskCompletion: taskCompletion = {
        premium: premium,
        join_our_channel: join_our_channel,
        follow_our_x: follow_our_x,
        daily_checkin: daily_checkin,
        daily_invite: daily_invite,
        daily_lotto: daily_lotto
    }

    res.success(taskCompletion);
});


// Telegram Premium任务完成
// 给前端返回用户的筹码、积分、排名信息
app.post("/task/premium", authMiddleware, async (req, res) => {
    // 获取请求头中的用户信息
    const initData = getInitData(res)!

    // 从req.header解析出来的常量
    const { id } = initData.user!
    const user_telegram_id = String(id);

    // 在MySQL表中存入一条任务记录
    const newPremium = await prisma.premiumTaskRecord.create({
        data: { user_telegram_id: user_telegram_id }
    });

    // 在Redis中增加筹码数量
    await redisClient.incrBy(`user_chips_${user_telegram_id}`, 2000);

    // 从Redis中获取数据
    const user_chips = await redisClient.get(`user_chips_${user_telegram_id}`);
    const user_points = await redisClient.zScore("user_points", user_telegram_id);
    // 注意排名是从0开始的，需要给排名+1
    const user_ranking = await redisClient.zRevRank("user_points", user_telegram_id);

    const userDataInfo: UserDataInfo = {
        chips: Number(user_chips),
        points: Number(user_points),
        ranking: Number(user_ranking) + 1
    }

    res.success(userDataInfo);
});

// Join Telegram Channel任务完成
// 给前端返回用户的筹码、积分、排名信息
app.post("/task/join_our_channel", authMiddleware, async (req, res) => {
    // 获取请求头中的用户信息
    const initData = getInitData(res)!

    // 从req.header解析出来的常量
    const { id } = initData.user!
    const user_telegram_id = String(id);

    // 在MySQL表中存入一条任务记录
    const newJoinOurChannel = await prisma.tGChannelTaskRecord.create({
        data: { user_telegram_id: user_telegram_id }
    });

    // 在Redis中增加筹码数量
    await redisClient.incrBy(`user_chips_${user_telegram_id}`, 2000);

    // 从Redis中获取数据
    const user_chips = await redisClient.get(`user_chips_${user_telegram_id}`);
    const user_points = await redisClient.zScore("user_points", user_telegram_id);
    // 注意排名是从0开始的，需要给排名+1
    const user_ranking = await redisClient.zRevRank("user_points", user_telegram_id);

    const userDataInfo: UserDataInfo = {
        chips: Number(user_chips),
        points: Number(user_points),
        ranking: Number(user_ranking) + 1
    }

    res.success(userDataInfo);
});

// Follow Our X任务完成
// 给前端返回用户的筹码、积分、排名信息
app.post("/task/follow_our_x", authMiddleware, async (req, res) => {
    // 获取请求头中的用户信息
    const initData = getInitData(res)!

    // 从req.header解析出来的常量
    const { id } = initData.user!
    const user_telegram_id = String(id);

    // 在MySQL表中存入一条任务记录
    const newFollowOurX = await prisma.followXTaskRecord.create({
        data: { user_telegram_id: user_telegram_id }
    });

    // 在Redis中增加筹码数量
    await redisClient.incrBy(`user_chips_${user_telegram_id}`, 2000);

    // 从Redis中获取数据
    const user_chips = await redisClient.get(`user_chips_${user_telegram_id}`);
    const user_points = await redisClient.zScore("user_points", user_telegram_id);
    // 注意排名是从0开始的，需要给排名+1
    const user_ranking = await redisClient.zRevRank("user_points", user_telegram_id);

    const userDataInfo: UserDataInfo = {
        chips: Number(user_chips),
        points: Number(user_points),
        ranking: Number(user_ranking) + 1
    }

    res.success(userDataInfo);
});

// Daily Checkin任务完成
// 给前端返回用户的筹码、积分、排名信息
app.post("/task/daily_checkin", authMiddleware, async (req, res) => {
    // 获取请求头中的用户信息
    const initData = getInitData(res)!

    // 从req.header解析出来的常量
    const { id } = initData.user!
    const user_telegram_id = String(id);

    // 在MySQL表中存入一条任务记录
    const newDailyCheckin = await prisma.dailyCheckinTaskRecord.create({
        data: { user_telegram_id: user_telegram_id }
    });

    // 记录当前时间并转换成ISO字符串
    const now = new Date();
    const isoTime: string = now.toISOString();
    // 在Redis中存入最新任务记录
    await redisClient.set(`user_daily_checkin_task_${user_telegram_id}`, isoTime);

    // 在Redis中增加筹码数量
    await redisClient.incrBy(`user_chips_${user_telegram_id}`, 1200);

    // 从Redis中获取数据
    const user_chips = await redisClient.get(`user_chips_${user_telegram_id}`);
    const user_points = await redisClient.zScore("user_points", user_telegram_id);
    // 注意排名是从0开始的，需要给排名+1
    const user_ranking = await redisClient.zRevRank("user_points", user_telegram_id);

    const userDataInfo: UserDataInfo = {
        chips: Number(user_chips),
        points: Number(user_points),
        ranking: Number(user_ranking) + 1
    }

    res.success(userDataInfo);
});

// Daily Invite任务完成
// 给前端返回用户的筹码、积分、排名信息
app.post("/task/daily_invite", authMiddleware, async (req, res) => {
    // 获取请求头中的用户信息
    const initData = getInitData(res)!

    // 从req.header解析出来的常量
    const { id } = initData.user!
    const user_telegram_id = String(id);

    // 记录当前时间并转换成ISO字符串
    const now = new Date();
    const isoTime: string = now.toISOString();
    // 在Redis中存入最新任务记录
    await redisClient.set(`user_daily_invite_task_${user_telegram_id}`, isoTime);

    // 在Redis中增加筹码数量
    await redisClient.incrBy(`user_chips_${user_telegram_id}`, 1200);

    // 从Redis中获取数据
    const user_chips = await redisClient.get(`user_chips_${user_telegram_id}`);
    const user_points = await redisClient.zScore("user_points", user_telegram_id);
    // 注意排名是从0开始的，需要给排名+1
    const user_ranking = await redisClient.zRevRank("user_points", user_telegram_id);

    const userDataInfo: UserDataInfo = {
        chips: Number(user_chips),
        points: Number(user_points),
        ranking: Number(user_ranking) + 1
    }

    res.success(userDataInfo);
});

// Daily Lotto任务完成
// 给前端返回用户的筹码、积分、排名信息
// TODO:暂时放下
app.post("/task/daily_lotto", authMiddleware, async (req, res) => {
    // 获取请求头中的用户信息
    const initData = getInitData(res)!

    // 从req.header解析出来的常量
    const { id } = initData.user!
    const user_telegram_id = String(id);

    // 在Redis中增加筹码数量
    await redisClient.incrBy(`user_chips_${user_telegram_id}`, 800);

    // 从Redis中获取数据
    const user_chips = await redisClient.get(`user_chips_${user_telegram_id}`);
    const user_points = await redisClient.zScore("user_points", user_telegram_id);
    // 注意排名是从0开始的，需要给排名+1
    const user_ranking = await redisClient.zRevRank("user_points", user_telegram_id);

    const userDataInfo: UserDataInfo = {
        chips: Number(user_chips),
        points: Number(user_points),
        ranking: Number(user_ranking) + 1
    }

    res.success(userDataInfo);
});

// 提供给排名页面排名信息
app.get("/rank", authMiddleware, async (req, res) => {
    // 获取请求头中的用户信息
    const initData = getInitData(res)!

    // 从req.header解析出来的常量
    const { id } = initData.user!
    const user_telegram_id = String(id);

    // TODO：暂时先弄前五名的用户
    const topPointsUsers: topPointsUsers[] = await redisClient.zRangeWithScores('user_points', 0, 4, {REV: true});

    const rankingUserInfoArray: RankingUserInfo[] = [];
    // 假设返回如上的数组
    for (let i = 0; i < topPointsUsers.length; i++) {
        const telegram_id: string = topPointsUsers[i].value;
        const points: number = topPointsUsers[i].score;

        const user = await prisma.users.findUnique({
            where: {
                user_telegram_id: String(telegram_id)
            }
        });

        const rank: number = (i / 2) + 1;
        let username: string = "";

        if (user) {
            username = user.username;
        } else {
            res.error("User Info fetched from MySQL meets errors");
        }

        const rankingUserInfo: RankingUserInfo = {
            user_telegram_id: telegram_id,
            username: username,
            rank: rank,
            points: points
        }

        rankingUserInfoArray.push(rankingUserInfo);
    }

    // 从MySQL获取用户信息
    const user = await prisma.users.findUnique({
        where: {
            user_telegram_id: user_telegram_id
        }
    });

    // 用户的邀请码
    let invitation_code: string = "";
    if (user) {
        if (user.invitation_code) {
            invitation_code = user.invitation_code;
        } else {
            res.error("user's invitation code is invalid");
        }
    } else {
        res.error("user data meets some errors");
    }
    
    // 用户邀请人数
    let invite_number = 0;
    const invite_record = await prisma.inviteRecord.findMany({
        where: {
            invitation_code: invitation_code
        }
    });
    if (invite_record) {
        invite_number = invite_record.length;
    } else {
        res.error("invite records data meets some errors");
    }

    // 从Redis中获取数据
    const user_chips = await redisClient.get(`user_chips_${user_telegram_id}`);
    const user_points = await redisClient.zScore("user_points", user_telegram_id);
    // 注意排名是从0开始的，需要给排名+1
    const user_ranking = await redisClient.zRevRank("user_points", user_telegram_id);

    const userDataInfo: UserDataInfoRank = {
        chips: Number(user_chips),
        points: Number(user_points),
        ranking: Number(user_ranking) + 1,
        invitation_code: invitation_code,
        invite_number: invite_number
    }

    const rankingPageInfo: RankingPageInfo = {
        current_user: userDataInfo,
        ranking_info: rankingUserInfoArray
    }
    
    res.success(rankingPageInfo);
});


//监听5000端口 理解为后端的端口号
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
}) 
