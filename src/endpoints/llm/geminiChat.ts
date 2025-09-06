import { OpenAPIRoute } from "chanfana";
import { AppContext } from "../../types";
import { z } from "zod";
import {
  ChatRequest,
  ChatResponse,
  GeminiRequest,
  GEMINI_CONFIG,
} from "./base";
import { ContentfulStatusCode } from "hono/utils/http-status";

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

      // 构建Gemini API请求
      const geminiRequest: z.infer<typeof GeminiRequest> = {
        contents: [
          {
            parts: [{ text: message }],
          },
        ],
        generationConfig: {
          temperature,
          maxOutputTokens: max_tokens,
        },
      };

      // 构建API URL
      const apiUrl = stream
        ? `${GEMINI_CONFIG.BASE_URL}/models/${GEMINI_CONFIG.STREAM_MODEL}:streamGenerateContent`
        : `${GEMINI_CONFIG.BASE_URL}/models/${GEMINI_CONFIG.MODEL}:generateContent`;

      // 发送请求到Gemini API
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-goog-api-key": apiKey,
        },
        body: JSON.stringify(geminiRequest),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Gemini API错误:", errorText);
        return c.json(
          {
            success: false,
            error: `Gemini API请求失败: ${response.status}`,
          },
          response.status as ContentfulStatusCode
        );
      }

      if (stream) {
        // 流式响应处理
        return this.handleStreamResponse(
          c,
          response,
          conversation_id || this.generateConversationId()
        );
      } else {
        // 普通响应处理
        return this.handleNormalResponse(
          c,
          response,
          conversation_id || this.generateConversationId()
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
   * 处理流式响应
   */
  private async handleStreamResponse(
    c: AppContext,
    response: Response,
    conversationId: string
  ) {
    const reader = response.body?.getReader();
    if (!reader) {
      return c.json(
        {
          success: false,
          error: "无法读取流式响应",
        },
        500
      );
    }

    // 设置流式响应头
    c.header("Content-Type", "text/plain; charset=utf-8");
    c.header("Cache-Control", "no-cache");
    c.header("Connection", "keep-alive");
    c.header("X-Conversation-ID", conversationId);

    // 创建可读流
    const stream = new ReadableStream({
      async start(controller) {
        const decoder = new TextDecoder();

        try {
          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              controller.close();
              break;
            }

            // 解析Gemini流式响应
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n");

            for (const line of lines) {
              if (line.trim() && line.startsWith("data: ")) {
                try {
                  const jsonStr = line.slice(6); // 移除 'data: ' 前缀
                  const data = JSON.parse(jsonStr);

                  // 提取文本内容
                  if (
                    data.candidates &&
                    data.candidates[0] &&
                    data.candidates[0].content
                  ) {
                    const content = data.candidates[0].content;
                    if (
                      content.parts &&
                      content.parts[0] &&
                      content.parts[0].text
                    ) {
                      controller.enqueue(
                        new TextEncoder().encode(content.parts[0].text)
                      );
                    }
                  }
                } catch (parseError) {
                  console.error("解析流式数据出错:", parseError);
                }
              }
            }
          }
        } catch (error) {
          console.error("流式响应处理出错:", error);
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
  }

  /**
   * 处理普通响应
   */
  private async handleNormalResponse(
    c: AppContext,
    response: Response,
    conversationId: string
  ) {
    const data = (await response.json()) as any;

    // 提取回复内容
    let message = "";
    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      const content = data.candidates[0].content;
      if (content.parts && content.parts[0] && content.parts[0].text) {
        message = content.parts[0].text;
      }
    }

    // 提取使用统计（如果有的话）
    const usage = data.usageMetadata
      ? {
          prompt_tokens: data.usageMetadata.promptTokenCount || 0,
          completion_tokens: data.usageMetadata.candidatesTokenCount || 0,
          total_tokens: data.usageMetadata.totalTokenCount || 0,
        }
      : undefined;

    return c.json({
      success: true,
      conversation_id: conversationId,
      message,
      usage,
    });
  }

  /**
   * 生成对话ID
   */
  private generateConversationId(): string {
    return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
