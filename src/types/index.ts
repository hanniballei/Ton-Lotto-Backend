export interface UserDataInfo {
    user_chips: number,
    user_points: number,
    user_ranking: number
}

export interface UserInfo {
    user_telegram_id: string,
    is_premium: boolean,
    invitation_code: number
} 

export interface InviteInfo {
    invitation_code: number,
    invited_user_telegram_id: string,
    if_premium: boolean
}

