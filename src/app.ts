import express from "express";
import cors from "cors";
import redisClient from "./db/redisdb";
import { PrismaClient } from "@prisma/client";
import { InviteInfo, UserDataInfo, UserInfo } from "./types";

const app = express();
// 使用三个中间件，用于资源跨域请求以及解析HTTP JSON数据
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

redisClient.on('ready', () => console.log('Redis Client is Ready'));
redisClient.connect()   // 连接Redis

const prisma = new PrismaClient();

// 返回用户信息
app.get("/user/:id", async (req, res) => {
    // 看看这里怎么加入string类型
    const { id } = req.params;
    
    // 从MySQL获取用户信息
    const user = await prisma.users.findUnique({
        where: {
            user_telegram_id: id
        }
    });
    
    // 检查用户是否是新用户
    if (user) {
        // 从Redis中获取数据
        const user_chips = redisClient.get(`user_chips_${id}`);
        const user_points = redisClient.zScore("user_points", id);
        // 注意排名是从0开始的，需要给排名+1
        const user_ranking = redisClient.zRevRank("user_points", id);
        
        const UserInfo: UserDataInfo =  {
            user_chips: Number(user_chips),
            user_points: Number(user_points),
            user_ranking: Number(user_ranking) + 1
        }
        res.json(UserInfo);
    } else {
        // 从前端解析数据
        const user: UserInfo = {
            user_telegram_id: req.body.user_telegram_id,
            is_premium: req.body.is_premium,
            invitation_code: req.body.invitation_code
        } 

        // 检查前端传递的用户信息中是否有邀请码信息
        if (req.body.invitation_code) {
            // 向MySQL用户信息表里存入数据
            const newUser = prisma.users.create({
                data: user
            })

            // 向MySQL被邀请记录表里存入数据
            // 不确定这里req.body解析出来的数据类型，如果就是普通的JSON格式那不需要加类型转换
            const invited_info: InviteInfo = {
                invitation_code: Number(req.body.invitation_code),
                invited_user_telegram_id: id,
                if_premium: Boolean(req.body.is_premium)
            };
            
            const newInvite = prisma.inviteRecord.create({
                data: invited_info
            });

            // 获取邀请码所有者的Telegram_ID
            // TODO：之后在生产环境的时候，用下面这个，目前数据表属性还没改无法使用
            
            // const InvitationCodeOwner = await prisma.users.findUnique({
            //     where: {
            //         invitation_code: Number(req.body.invitation_code)
            //     }
            // });
            const InvitationCodeOwner = await prisma.users.findMany({
                where: {
                    invitation_code: Number(req.body.invitation_code)
                }
            });

            // 检测被邀请用户是否是Premium会员，如果是的话则奖励增多
            // TODO: 具体增加的数字还会修改
            if (Boolean(req.body.is_premium)) {
                // 在Redis中增加邀请者的筹码数
                // TODO
                await redisClient.incrBy(`user_chips_${InvitationCodeOwner[0].user_telegram_id}`, 2000);

                // 在Redis中初始化用户信息
                await redisClient.set(`user_chips_${id}`, 2000);
                await redisClient.zAdd("user_points", [{score: 0, value: id}]);
                
                // 从Redis中获取用户信息
                const user_chips = redisClient.get(`user_chips_${id}`);
                const user_points = redisClient.zScore("user_points", id);
                // 注意排名是从0开始的，需要给排名+1
                const user_ranking = redisClient.zRevRank("user_points", id);
                
                const UserInfo: UserDataInfo =  {
                    user_chips: Number(user_chips),
                    user_points: Number(user_points),
                    user_ranking: Number(user_ranking) + 1
                }
                res.json(UserInfo);
            } else {
                // 在Redis中增加邀请者的筹码数
                // TODO
                await redisClient.incrBy(`user_chips_${InvitationCodeOwner[0].user_telegram_id}`, 1000);

                // 在Redis中初始化用户信息
                await redisClient.set(`user_chips_${id}`, 1000);
                await redisClient.zAdd("user_points", [{score: 0, value: id}]);
                
                // 从Redis中获取用户信息
                const user_chips = redisClient.get(`user_chips_${id}`);
                const user_points = redisClient.zScore("user_points", id);
                // 注意排名是从0开始的，前端需要给排名+1
                const user_ranking = redisClient.zRevRank("user_points", id);
                
                const UserInfo: UserDataInfo =  {
                    user_chips: Number(user_chips),
                    user_points: Number(user_points),
                    user_ranking: Number(user_ranking)
                }
                res.json(UserInfo);
            }
        } else {
            // prisma的create方法应该返回这行数据的所有信息
            // 向MySQL里存入数据
            const newUser = prisma.users.create({
                data: user
            })

            // 在Redis中初始化用户信息
            await redisClient.set(`user_chips_${id}`, 0);
            await redisClient.zAdd("user_points", [{score: 0, value: id}]);
            
            // 从Redis中获取用户信息
            const user_chips = redisClient.get(`user_chips_${id}`);
            const user_points = redisClient.zScore("user_points", id);
            // 注意排名是从0开始的，前端需要给排名+1
            const user_ranking = redisClient.zRevRank("user_points", id);
            
            const UserInfo: UserDataInfo =  {
                user_chips: Number(user_chips),
                user_points: Number(user_points),
                user_ranking: Number(user_ranking) + 1
            }
            res.json(UserInfo);
        }
    }

});


//监听5000端口 理解为后端的端口号
app.listen(5000,()=>{
    console.log("Connected to backend!");
}) 
