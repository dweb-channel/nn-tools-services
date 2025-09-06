import { z } from "zod";

// Gemini API 请求和响应的类型定义
export const GeminiMessage = z.object({
  role: z.enum(["user", "model"]).optional(),
  parts: z.array(z.object({
    text: z.string()
  }))
});

export const GeminiRequest = z.object({
  contents: z.array(GeminiMessage),
  generationConfig: z.object({
    temperature: z.number().min(0).max(2).optional(),
    topK: z.number().optional(),
    topP: z.number().min(0).max(1).optional(),
    maxOutputTokens: z.number().optional(),
    stopSequences: z.array(z.string()).optional()
  }).optional(),
  safetySettings: z.array(z.object({
    category: z.string(),
    threshold: z.string()
  })).optional()
});

export const ChatRequest = z.object({
  message: z.string().min(1, "消息不能为空"),
  conversation_id: z.string().optional(),
  temperature: z.number().min(0).max(2).default(0.7),
  max_tokens: z.number().min(1).max(8192).default(1024),
  stream: z.boolean().default(true)
});

export const ChatResponse = z.object({
  success: z.boolean(),
  conversation_id: z.string(),
  message: z.string(),
  usage: z.object({
    prompt_tokens: z.number(),
    completion_tokens: z.number(),
    total_tokens: z.number()
  }).optional()
});

// Gemini API 配置
export const GEMINI_CONFIG = {
  BASE_URL: "https://generativelanguage.googleapis.com/v1beta",
  MODEL: "gemini-2.0-flash",
  STREAM_MODEL: "gemini-2.0-flash"
} as const;
