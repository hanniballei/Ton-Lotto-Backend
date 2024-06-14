declare namespace NodeJS {
    interface ProcessEnv {
        PORT: number
        DATABASE_URL: string
        BOT_TOKEN: string
    }
}

// 返回前端的用户筹码、积分、排名信息
export interface UserDataInfo {
    chips: number,
    points: number,
    ranking: number
}

// 向MySQL的Users表存入的用户信息
export interface UserInfo {
    user_telegram_id: string,
    username: string,
    is_premium: boolean,
    invitation_code: string
}

// 向MySQL的InviteRecord表存入的被邀请信息
export interface InviteInfo {
    invitation_code: string,
    invited_user_telegram_id: string,
    is_premium: boolean
}

// 记录刮刮乐每个区域的信息
export interface LottoZone {
    // TODO
    icon: "pepe" | "doge" | "pogai" | "bonk",
    tier: 1 | 2 | 3 | 4,
    reward: number
}

// 记录刮刮乐卡的信息
export interface LottoInfo {
    pepe_num: number,
    rewards: number,
    lotto: LottoZone[]
}

// Redis中存储的最新刮刮乐记录
export interface LottoInfoinRedis {
    lottoInfo: LottoInfo,
    bought_at: Date,
    done: boolean
}

// 生成彩票后返回给前端的内容
export interface LottoandChipsInfo {
    is_remain: boolean,
    lottoInfo: LottoInfo,
    chips: number
}

// 任务完成信息
export interface taskCompletion {
    premium: boolean,
    join_our_channel: boolean,
    follow_our_x: boolean,
    daily_checkin: boolean,
    daily_invite: boolean,
    daily_lotto: boolean
}

// 用户排名信息
export interface RankingUserInfo {
    user_telegram_id: string,
    username: string,
    rank: number,
    points: number
}

export interface UserDataInfoRank {
    chips: number,
    points: number,
    ranking: number,
    invitation_code: string,
    invite_number: number
}

// 排名界面需要返回给前端的信息
export interface RankingPageInfo {
    current_user: UserDataInfoRank,
    ranking_info: RankingUserInfo[]
}

export interface UserTest {
    invitation_code: string,
    is_premium: boolean,
    chips: number,
    points: number,
    ranking: number,
    lotto_number: number,
    lotto_win_number: number,
    newest_lotto: LottoInfoinRedis,
    daily_checkin: Date,
    daily_invite: Date
}

export interface topPointsUsers {
    score: number,
    value: string
}