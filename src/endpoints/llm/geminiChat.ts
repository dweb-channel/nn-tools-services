import { OpenAPIRoute } from "chanfana";
import { AppContext } from "../../types";
import { z } from "zod";
import {
  ChatRequest,
  ChatResponse,
} from "./base";
import { ContentfulStatusCode } from "hono/utils/http-status";
import { GoogleGenerativeAI } from "@google/generative-ai";

export class GeminiChatEndpoint extends OpenAPIRoute {
  public schema = {
    tags: ["LLM"],
    summary: "与Gemini模型进行流式对话",
    description: "支持流式响应的Gemini对话接口，可以实时获取AI回复",
    operationId: "gemini-chat",
    request: {
      body: {
        content: {
          "application/json": {
            schema: ChatRequest,
          },
        },
      },
    },
    responses: {
      "200": {
        description: "流式响应或普通JSON响应",
        content: {
          "text/plain": {
            schema: z.string().describe("流式响应数据"),
          },
          "application/json": {
            schema: ChatResponse,
          },
        },
      },
      "400": {
        description: "请求参数错误",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              error: z.string(),
            }),
          },
        },
      },
      "500": {
        description: "服务器内部错误",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              error: z.string(),
            }),
          },
        },
      },
    },
  };

  public async handle(c: AppContext) {
    try {
      // 获取并验证请求数据
      const data = await this.getValidatedData<typeof this.schema>();
      const { message, conversation_id, temperature, max_tokens, stream } =
        data.body;

      // 检查API密钥
      const apiKey = c.env.GEMINI_API_KEY;
      if (!apiKey) {
        return c.json(
          {
            success: false,
            error: "Gemini API密钥未配置",
          },
          500
        );
      }

      // 初始化 Google Generative AI
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

      // 构建请求内容
      const contents = [
        {
          role: "user" as const,
          parts: [{ text: message }],
        },
      ];

      // 生成配置
      const generationConfig = {
        temperature,
        maxOutputTokens: max_tokens,
      };

      const conversationId = conversation_id || this.generateConversationId();

      if (stream) {
        // 流式响应处理
        return this.handleStreamResponseWithSDK(
          c,
          model,
          contents,
          generationConfig,
          conversationId
        );
      } else {
        // 普通响应处理
        return this.handleNormalResponseWithSDK(
          c,
          model,
          contents,
          generationConfig,
          conversationId
        );
      }
    } catch (error) {
      console.error("处理Gemini聊天请求时出错:", error);
      return c.json(
        {
          success: false,
          error: "处理请求时发生内部错误",
        },
        500
      );
    }
  }

  /**
   * 使用官方SDK处理流式响应
   */
  private async handleStreamResponseWithSDK(
    c: AppContext,
    model: any,
    contents: any[],
    generationConfig: any,
    conversationId: string
  ) {
    try {
      // 设置流式响应头
      c.header("Content-Type", "text/plain; charset=utf-8");
      c.header("Cache-Control", "no-cache");
      c.header("Connection", "keep-alive");
      c.header("X-Conversation-ID", conversationId);

      // 创建可读流
      const stream = new ReadableStream({
        async start(controller) {
          try {
            // 使用官方SDK生成流式内容
            const result = await model.generateContentStream({
              contents,
              generationConfig,
            });

            // 遍历流式响应
            for await (const chunk of result.stream) {
              const text = chunk.text();
              if (text) {
                // 将文本内容编码并发送到前端
                controller.enqueue(new TextEncoder().encode(text));
              }
            }

            controller.close();
          } catch (error) {
            console.error("SDK流式响应处理出错:", error);
            controller.error(error);
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Conversation-ID": conversationId,
        },
      });
    } catch (error) {
      console.error("创建流式响应时出错:", error);
      return c.json(
        {
          success: false,
          error: "创建流式响应失败",
        },
        500
      );
    }
  }

  /**
   * 使用官方SDK处理普通响应
   */
  private async handleNormalResponseWithSDK(
    c: AppContext,
    model: any,
    contents: any[],
    generationConfig: any,
    conversationId: string
  ) {
    try {
      // 使用官方SDK生成内容
      const result = await model.generateContent({
        contents,
        generationConfig,
      });

      const response = await result.response;
      const message = response.text();

      // 提取使用统计（如果有的话）
      const usage = response.usageMetadata
        ? {
            prompt_tokens: response.usageMetadata.promptTokenCount || 0,
            completion_tokens: response.usageMetadata.candidatesTokenCount || 0,
            total_tokens: response.usageMetadata.totalTokenCount || 0,
          }
        : undefined;

      return c.json({
        success: true,
        conversation_id: conversationId,
        message,
        usage,
      });
    } catch (error) {
      console.error("SDK普通响应处理出错:", error);
      return c.json(
        {
          success: false,
          error: "生成内容失败",
        },
        500
      );
    }
  }

  /**
   * 生成对话ID
   */
  private generateConversationId(): string {
    return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
