import { createClient } from "redis";
import dotenv from "dotenv";
dotenv.config();

// 生产环境替换常量
const redisClient = createClient({
    password: process.env.Redis_Password,
    socket: {
        host: process.env.Redis_Host,
        port: Number(process.env.Redis_Port),
    }
});

export default redisClient;
