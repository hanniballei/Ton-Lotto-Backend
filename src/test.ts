import { Bot, InlineKeyboard } from "grammy";
import dotenv from 'dotenv';
dotenv.config();

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