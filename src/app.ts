import express from "express";
import cors from "cors";
import redisClient from "./db/redisdb";
import { PrismaClient } from "@prisma/client";
import { InviteInfo, UserDataInfo, UserInfo } from "./types";
import { invitationCodeGenerator } from "./utils/utilfunc";

const app = express();
// 使用三个中间件，用于资源跨域请求以及解析HTTP JSON数据
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

redisClient.on('ready', () => console.log('Redis Client is Ready'));
redisClient.connect()   // 连接Redis

const prisma = new PrismaClient();

// 返回用户信息
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
        const placeholder:string = "";
        
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
                await redisClient.zAdd("user_points", [{score: 0, value: user_telegram_id}]);
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
                await redisClient.zAdd("user_points", [{score: 0, value: user_telegram_id}]);
            }
        } else {
            // 在Redis中初始化用户信息
            await redisClient.set(`user_chips_${user_telegram_id}`, 0);
            await redisClient.zAdd("user_points", [{score: 0, value: user_telegram_id}]);
        }
    }

    // 从Redis中获取数据
    const user_chips = await redisClient.get(`user_chips_${user_telegram_id}`);
    const user_points = await redisClient.zScore("user_points", user_telegram_id);
    // 注意排名是从0开始的，需要给排名+1
    const user_ranking = await redisClient.zRevRank("user_points", user_telegram_id);
    
    const userDataInfo: UserDataInfo =  {
        chips: Number(user_chips),
        points: Number(user_points),
        ranking: Number(user_ranking) + 1
    }
    
    res.json(userDataInfo);
});


//监听5000端口 理解为后端的端口号
app.listen(5000,()=>{
    console.log("Connected to backend!");
}) 
