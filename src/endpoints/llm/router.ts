import { Hono } from "hono";
import { fromHono } from "chanfana";
import { GeminiChatEndpoint } from "./geminiChat";

// 创建LLM子路由
export const llmRouter = fromHono(new Hono());

// 注册Gemini聊天端点
llmRouter.post("/chat", GeminiChatEndpoint);
