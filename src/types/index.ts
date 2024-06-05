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

