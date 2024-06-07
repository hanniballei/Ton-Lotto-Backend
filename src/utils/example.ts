import { LottoInfo, LottoInfoinRedis } from "../types";

export const isoTimeExample: string = "2024-06-07T14:38:53.427Z";
const dateTimeExample: Date = new Date(isoTimeExample);
// 初始化用户信息时填入的占位彩票信息
const lottoInfoExample: LottoInfo = {
    "pepe_num": 0,
    "rewards": 0,
    "lotto": [
      {
        "icon": "pogai",
        "tier": 4,
        "reward": 14000
      },
      {
        "icon": "bonk",
        "tier": 4,
        "reward": 35000
      },
      {
        "icon": "doge",
        "tier": 4,
        "reward": 62000
      },
      {
        "icon": "pogai",
        "tier": 4,
        "reward": 40000
      },
      {
        "icon": "pogai",
        "tier": 4,
        "reward": 43000
      },
      {
        "icon": "bonk",
        "tier": 4,
        "reward": 94000
      },
      {
        "icon": "pogai",
        "tier": 4,
        "reward": 43000
      },
      {
        "icon": "doge",
        "tier": 4,
        "reward": 67000
      },
      {
        "icon": "bonk",
        "tier": 4,
        "reward": 98000
      },
      {
        "icon": "bonk",
        "tier": 4,
        "reward": 69000
      },
      {
        "icon": "doge",
        "tier": 4,
        "reward": 56000
      },
      {
        "icon": "doge",
        "tier": 4,
        "reward": 30000
      }
    ]
  } 

const lottoInfoinRedisExample: LottoInfoinRedis = {
    lottoInfo: lottoInfoExample,
    bought_at: dateTimeExample,
    done: true
}

// 转为字符串格式
export const lottoInfoinRedisExampleJson: string = JSON.stringify(lottoInfoinRedisExample);