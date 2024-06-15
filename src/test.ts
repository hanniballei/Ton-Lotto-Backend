import { Bot, InlineKeyboard } from "grammy";
import dotenv from 'dotenv';
import { HttpsProxyAgent } from "https-proxy-agent";
dotenv.config();

const http_proxy = "http://192.168.203.1:4780";
// 192.168.203.1
const agent = new HttpsProxyAgent(http_proxy);

// Bot实例
const bot = new Bot(process.env.BOT_TOKEN!, {
    client: {
        baseFetchConfig: {
          agent,
        },
      },
});

// bot.command("start", (ctx) => ctx.reply("Welcome! Up and running."));

// Bot对/start指令的回复
bot.command("start", async (ctx) => {
    const inlineKeyboard = new InlineKeyboard()
        .url("🎮  Play Lotto Now", process.env.TMA_Link!)
        .row()
        .url("💬  Join Our Community", process.env.Channel_Link!)
        .row()
        .url("✖️  Follow Our X", process.env.Twitter_Link!);
    
    await ctx.reply("Test", {
        reply_markup: inlineKeyboard
    });
});

/**
bot.catch((err) => {
    console.error('Error in bot:', err);
});
*/

// Bot启动
bot.start();