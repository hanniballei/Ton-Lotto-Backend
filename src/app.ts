import express from "express";
import cors from "cors";
import redisClient from "./db/redisdb";
import { PrismaClient } from "@prisma/client";
import { InviteInfo, LottoInfo, LottoInfoinRedis, LottoandChipsInfo, UserDataInfo, UserInfo, taskCompletion } from "./types";
import { checkIfTimeIsToday, invitationCodeGenerator, lottoGenerator } from "./utils/utilfunc";
import { isoTimeExample, lottoInfoinRedisExampleJson } from "./utils/example";
import responseMiddleware from "./middlewares/responseMiddleware";

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
// 前端发送数据的格式是Object，里面有user_telegram_id, username, is_premium和invitation_code
app.get("/user", async (req, res) => {
    // 从req.body解析出来的常量
    const user_telegram_id = String(req.body.user_telegram_id);
    const username = String(req.body.username);
    const is_premium = Boolean(req.body.is_premium);
    // 这里的邀请码是指该用户点击的邀请码，而不是属于他的邀请码
    const invitation_code = String(req.body.invitation_code);

    // 从MySQL获取用户信息
    const user = await prisma.users.findUnique({
        where: {
            user_telegram_id: user_telegram_id
        }
    });

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
            username: username,
            is_premium: is_premium,
            // 首次将用户信息存入MySQL时，邀请码这一个字段先置为空字符串
            invitation_code: placeholder
        }

        // 向MySQL用户信息表里存入数据
        const newUser = await prisma.users.create({
            data: user
        })

        // 获取自增id
        const id: number = Number(newUser.id);

        // 根据MySQL的自增id生成邀请码
        const user_invitation_code: string = invitationCodeGenerator(id);

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
        if (invitation_code) {
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
            // TODO: 具体增加的数字还会修改
            if (is_premium) {
                // 在Redis中增加邀请者的筹码数
                // 判断获取到的邀请码所有者信息是否为空
                if (InvitationCodeOwner) {
                    // TODO
                    await redisClient.incrBy(`user_chips_${InvitationCodeOwner.user_telegram_id}`, 2000);
                } else {
                    res.send("Invitaion Code Owner Information is empty!");
                }

                // 在Redis中初始化用户信息
                // TODO
                await redisClient.set(`user_chips_${user_telegram_id}`, 2000);
                await redisClient.zAdd("user_points", [{ score: 0, value: user_telegram_id }]);
            } else {
                // 在Redis中增加邀请者的筹码数
                // 判断获取到的邀请码所有者信息是否为空
                if (InvitationCodeOwner) {
                    // TODO
                    await redisClient.incrBy(`user_chips_${InvitationCodeOwner.user_telegram_id}`, 1000);
                } else {
                    res.send("Invitaion Code Owner Information is empty!");
                }

                // 在Redis中初始化用户信息
                // TODO
                await redisClient.set(`user_chips_${user_telegram_id}`, 1000);
                await redisClient.zAdd("user_points", [{ score: 0, value: user_telegram_id }]);
                await redisClient.set(`user_lotto_number_${user_telegram_id}`, 0);
                await redisClient.set(`user_lotto_win_number_${user_telegram_id}`, 0);
                // TODO：别忘了初始化最新刮刮乐信息、最新邀请任务记录、最新Checkin任务记录
                await redisClient.set(`user_newest_lotto_${user_telegram_id}`, lottoInfoinRedisExampleJson);
                await redisClient.set(`user_daily_checkin_task_${user_telegram_id}`, isoTimeExample);
                await redisClient.set(`user_daily_invite_task_${user_telegram_id}`, isoTimeExample);
            }
        } else {
            // 在Redis中初始化用户信息
            await redisClient.set(`user_chips_${user_telegram_id}`, 0);
            await redisClient.zAdd("user_points", [{ score: 0, value: user_telegram_id }]);
            await redisClient.set(`user_lotto_number_${user_telegram_id}`, 0);
            await redisClient.set(`user_lotto_win_number_${user_telegram_id}`, 0);
            // TODO：别忘了初始化最新刮刮乐信息、最新邀请任务记录、最新Checkin任务记录
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

    const userDataInfo: UserDataInfo = {
        chips: Number(user_chips),
        points: Number(user_points),
        ranking: Number(user_ranking) + 1
    }

    res.json(userDataInfo);
});


// 进入彩票页面检查是否有没刮完的彩票
// 前端发送的数据是user_telegram_id
// 返回类型是从下面两种类型中选择一个：string用来标识数据获取出错，boolean用来标识该用户是否有未刮完的彩票
app.get("/lotto/check", async (req, res) => {
    // 从req.body解析出来的常量
    const user_telegram_id = String(req.body.user_telegram_id);

    const lotto_record = await redisClient.get(`user_newest_lotto_${user_telegram_id}`);
    if (lotto_record) {
        // 用一个新变量存储解析后的JSON数据
        const lotto_record_json: LottoInfoinRedis = JSON.parse(lotto_record);
        const lotto_done: boolean = lotto_record_json.done;
        res.send(!lotto_done);
    } else {
        res.send("Lottery Record meets some errors");
    }
});


// 彩票游戏开始
// 我会返回两种类型中的一种：string用于提示筹码是否足够以及一些数据获取的错误，LottoandChipsInfo用来记录彩票信息和用户筹码信息
// 前端发送的数据是user_telegram_id
app.get("/lotto/start", async (req, res) => {
    // 从req.body解析出来的常量
    const user_telegram_id = String(req.body.user_telegram_id);

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

                res.json(lottoandChipsInfo);
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

                res.json(lottoandChipsInfo);
            }
        } else {
            res.send("Lottery Record meets some errors");
        }
    } else {
        res.send(`user &{user_telegram_id} doesn't have enough chips for a lotto`);
    }

});

// 彩票游戏开奖
// 注意，我会返回两种数据类型中的一个：string用于标明数据获取的错误，UserDataInfo用于指明用户筹码、积分、排名信息。
// 前端发送数据的格式是Object，里面有user_telegram_id，rewards
app.post("/lotto/end", async (req, res) => {
    // 从req.body解析出来的常量
    const user_telegram_id = String(req.body.user_telegram_id);
    const rewards = Number(req.body.rewards);

    // 获取当前用户最近一次彩票信息
    const lotto_record = await redisClient.get(`user_newest_lotto_${user_telegram_id}`);
    if (lotto_record) {
        // 用一个新变量存储解析后的JSON数据，修改done字段为true
        const lotto_record_json: LottoInfoinRedis = JSON.parse(lotto_record);
        lotto_record_json.done = true;
        const new_lotto_record = JSON.stringify(lotto_record_json);

        // 将修改后的数据存入Redis
        await redisClient.set(`user_newest_lotto_${user_telegram_id}`, new_lotto_record);

        // 检查是否中奖
        if (rewards !== 0) {
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

        res.json(userDataInfo);
    } else {
        res.send("Lottery Record meets some errors");
    }
});

// 进入任务界面检查任务完成情况
// 前端需要传入user_telegram_id
app.get("task/check", async (req, res) => {
    // 从req.body解析出来的常量
    const user_telegram_id = String(req.body.user_telegram_id);

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
        // 用一个新变量存储解析后的JSON数据，修改done字段为true
        const lotto_record_json: LottoInfoinRedis = JSON.parse(lotto_record);
        const dailyLottoTime: Date = lotto_record_json.bought_at;
        const dailyLottoTimeIso: string = dailyLottoTime.toISOString();
        if (checkIfTimeIsToday(dailyLottoTimeIso)) {
            daily_lotto = true;
        }
    } else {
        res.send("Lotto Record meets some errors");
    }

    const taskCompletion: taskCompletion = {
        premium: premium,
        join_our_channel: join_our_channel,
        follow_our_x: follow_our_x,
        daily_checkin: daily_checkin,
        daily_invite: daily_invite,
        daily_lotto: daily_lotto
    }

    res.json(taskCompletion);
});


// Telegram Premium任务完成
// 前端需要传入user_telegram_id
// 给前端返回用户的筹码、积分、排名信息
app.post("task/premium", async (req, res) => {
    // 从req.body解析出来的常量
    const user_telegram_id = String(req.body.user_telegram_id);


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

    res.json(userDataInfo);
});

// Join Telegram Channel任务完成
// 前端需要传入user_telegram_id
// 给前端返回用户的筹码、积分、排名信息
app.post("task/join_our_channel", async (req, res) => {
    // 从req.body解析出来的常量
    const user_telegram_id = String(req.body.user_telegram_id);

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

    res.json(userDataInfo);
});

// Follow Our X任务完成
// 前端需要传入user_telegram_id
// 给前端返回用户的筹码、积分、排名信息
app.post("task/follow_our_x", async (req, res) => {
    // 从req.body解析出来的常量
    const user_telegram_id = String(req.body.user_telegram_id);

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

    res.json(userDataInfo);
});

// Daily Checkin任务完成
// 前端需要传入user_telegram_id
// 给前端返回用户的筹码、积分、排名信息
app.post("task/daily_checkin", async (req, res) => {
    // 从req.body解析出来的常量
    const user_telegram_id = String(req.body.user_telegram_id);

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
    await redisClient.incrBy(`user_chips_${user_telegram_id}`, 600);

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

    res.json(userDataInfo);
});

// Daily Invite任务完成
// 前端需要传入user_telegram_id
// 给前端返回用户的筹码、积分、排名信息
app.post("task/daily_invite", async (req, res) => {
    // 从req.body解析出来的常量
    const user_telegram_id = String(req.body.user_telegram_id);

    // 记录当前时间并转换成ISO字符串
    const now = new Date();
    const isoTime: string = now.toISOString();
    // 在Redis中存入最新任务记录
    await redisClient.set(`user_daily_invite_task_${user_telegram_id}`, isoTime);

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

    res.json(userDataInfo);
});

// Daily Lotto任务完成
// 前端需要传入user_telegram_id
// 给前端返回用户的筹码、积分、排名信息
app.post("task/daily_lotto", async (req, res) => {
    // 从req.body解析出来的常量
    const user_telegram_id = String(req.body.user_telegram_id);

    // 在Redis中增加筹码数量
    await redisClient.incrBy(`user_chips_${user_telegram_id}`, 600);

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

    res.json(userDataInfo);
});


//监听5000端口 理解为后端的端口号
app.listen(5000, () => {
    console.log("Connected to backend!");
}) 
