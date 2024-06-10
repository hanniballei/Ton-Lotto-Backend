import e from "express";
import { LottoInfo, LottoZone, RankingUserInfo } from "../types";
import { PrismaClient } from "@prisma/client";

// 邀请码生成器
export function invitationCodeGenerator(id: number): string {
    const alphabet_mid: string = "aVmkpDnZtb";
    const alphabet_edge: string = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const sumNumber: string = String(id + 1234567890);
    let middle_code: string = "";

    for (let char of sumNumber) {
        const digit: number = parseInt(char);
        middle_code += alphabet_mid[digit];
    }

    const randomEdgeChar = () => alphabet_edge[Math.floor(Math.random() * alphabet_edge.length)];
    const invitation_code: string = randomEdgeChar() + middle_code + randomEdgeChar();

    return invitation_code;
}

// 随机pepe头像个数
function numberOfPepeGenerator(): number {
    const random: number = Math.random() * 100; // 生成一个0到100的随机数
    
    // 30%的概率没有pepe头像，即没中奖
    // 60.9%的概率生成一个pepe头像
    // 9%的概率生成两个pepe头像
    // 0.1%的概率生成三个pepe头像
    if (random < 30) {
        return 0;
    } else if (random < 90.9) {
        return 1;
    } else if (random < 99.9) {
        return 2;
    } else {
        return 3;
    }
}

// 随机奖励的等级
function tierGenerator(): 1 | 2 | 3 | 4 {
    const random: number = Math.random() * 100; // 生成一个0到100的随机数
    
    // 75%的概率
    if (random < 75) {
        return 4;
    } else if (random < 98) {
        return 3;
    } else if (random < 99.8) {
        return 2;
    } else {
        return 1;
    }
}

// 生成Tier4的随机奖励,100-1900
function tier4RewardGenerator(): number {
    const min: number = 100;
    // 生成一个0到18之间的随机整数
    const randomReward: number = Math.floor(Math.random() * 19);

    return (min + randomReward * 100);
}

// 生成Tier3的随机奖励,2000-9500
function tier3RewardGenerator(): number {
    const min: number  = 2000;
    // 生成一个0到18之间的随机整数
    const randomReward: number  = Math.floor(Math.random() * 16);

    return (min + randomReward * 500);
}

// 生成Tier2的随机奖励,10000-45000
function tier2RewardGenerator(): number {
    const min: number  = 10000;
    // 生成一个0到18之间的随机整数
    const randomReward: number  = Math.floor(Math.random() * 8);

    return (min + randomReward * 5000);
}

// 生成Tier1的随机奖励,50000-100000
function tier1RewardGenerator(): number {
    const min: number  = 50000;
    // 生成一个0到18之间的随机整数
    const randomReward: number  = Math.floor(Math.random() * 6);

    return (min + randomReward * 10000);
}

// 随机奖励的数额
function rewardGenerator(tier: 1 | 2 | 3 | 4): number {
    let reward: number = 0;
    if (tier === 4) {
        reward = tier4RewardGenerator();
    } else if (tier === 3) {
        reward = tier3RewardGenerator();
    } else if (tier === 2) {
        reward = tier2RewardGenerator();
    } else {
        reward = tier1RewardGenerator();
    }

    return reward;
}

// 随机其他头像
function iconGenerator(): "doge" | "pogai" | "bonk" {
    const random: number = Math.random() * 100; // 生成一个0到100的随机数

    if (random < 33) {
        return "doge";
    } else if (random < 66) {
        return "pogai";
    } else {
        return "bonk";
    }
}

// 其他头像区域奖励生成
function otherRewardGenerator(): number {
    const min = 1000;
    // 生成一个介于0到99之间的随机整数
    const randomReward = Math.floor(Math.random() * 100);
    
    return (min + randomReward * 1000);
}


// 彩票生成器
export function lottoGenerator(): LottoInfo {
    const pepe_num: number = numberOfPepeGenerator();
    let rewards: number = 0;
    let lotto: LottoZone[] = [];

    // 构造pepe头像区域
    for(let i=0; i<pepe_num; i++) {
        const tier: 1 | 2 | 3 | 4 = tierGenerator();
        const reward: number = rewardGenerator(tier);
        
        rewards += reward;
        
        const pepe_lotto: LottoZone = {
            icon: "pepe",
            tier: tier,
            reward: reward
        }
        lotto.push(pepe_lotto);
    }

    // 构造其他头像区域
    for(let j=0; j<(12-pepe_num); j++) {
        const icon = iconGenerator();
        const tier: 1 | 2 | 3 | 4 = 4;
        const reward: number = otherRewardGenerator();

        const icon_lotto: LottoZone = {
            icon: icon,
            tier: tier,
            reward: reward
        }
        lotto.push(icon_lotto);
    }

    const resultLotto: LottoInfo = {
        pepe_num: pepe_num,
        rewards: rewards,
        lotto: lotto
    }

    return resultLotto;
}

// 将获取的时间与当天零点比较，查看任务是否是今天完成的
export function checkIfTimeIsToday(isoTime: string): boolean {
    // 将ISO字符串转换为Date对象
    const dateToCheck = new Date(isoTime);

    // 获取当前日期的零点
    const today = new Date();
    today.setHours(0, 0, 0, 0); // 设置当前日期的时间为零点

    // 获取明天的零点
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1); // 设置为明天的日期

    // 检查ISO字符串代表的日期是否在今天
    const isToday = (dateToCheck >= today) && (dateToCheck < tomorrow);

    return isToday;
}


