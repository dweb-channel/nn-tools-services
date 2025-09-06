# Gemini API 集成部署指南

## 功能概述

本项目已集成Gemini AI对话功能，支持：
- 流式响应对话
- 普通JSON响应
- 自动生成对话ID
- 完整的OpenAPI文档

## API密钥配置

### 1. 获取Gemini API密钥
1. 访问 [Google AI Studio](https://makersuite.google.com/app/apikey)
2. 创建新的API密钥
3. 复制密钥备用

### 2. 本地开发配置
在项目根目录创建 `.dev.vars` 文件：
```bash
GEMINI_API_KEY=your_gemini_api_key_here
```

### 3. 生产环境配置
使用Wrangler命令设置密钥：
```bash
# 设置生产环境密钥
npx wrangler secret put GEMINI_API_KEY

# 验证密钥是否设置成功
npx wrangler secret list
```

## API端点

### POST /llm/chat
与Gemini模型进行对话

**请求示例**：
```bash
# 流式响应（默认）
curl -X POST "http://localhost:8787/llm/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "解释一下人工智能是如何工作的",
    "stream": true,
    "temperature": 0.7,
    "max_tokens": 1024
  }'

# 普通JSON响应
curl -X POST "http://localhost:8787/llm/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "你好，请介绍一下自己",
    "stream": false,
    "temperature": 0.7,
    "max_tokens": 1024
  }'
```

**请求参数**：
- `message` (必需): 用户消息内容
- `conversation_id` (可选): 对话ID，用于维持上下文
- `temperature` (可选): 0-2之间，控制回复的随机性，默认0.7
- `max_tokens` (可选): 最大输出token数，默认1024
- `stream` (可选): 是否启用流式响应，默认true

**流式响应**：
- Content-Type: `text/plain; charset=utf-8`
- 实时返回AI生成的文本流
- 响应头包含 `X-Conversation-ID`

**普通响应**：
```json
{
  "success": true,
  "conversation_id": "conv_1704067200000_abc123def",
  "message": "你好！我是Gemini，一个由Google开发的大型语言模型...",
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 50,
    "total_tokens": 60
  }
}
```

## 本地开发

### 1. 安装依赖
```bash
npm install
```

### 2. 设置环境变量
创建 `.dev.vars` 文件并添加Gemini API密钥

### 3. 启动开发服务器
```bash
npm run dev
```

### 4. 查看API文档
访问 http://localhost:8787 查看完整的OpenAPI文档

## 部署到Cloudflare

### 1. 设置API密钥
```bash
wrangler secret put GEMINI_API_KEY
```

### 2. 部署应用
```bash
npm run deploy
```

### 3. 验证部署
访问部署后的URL，测试 `/llm/chat` 端点

## 前端集成示例

### JavaScript Fetch API
```javascript
// 流式响应处理
async function streamChat(message) {
  const response = await fetch('/llm/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: message,
      stream: true
    })
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    const chunk = decoder.decode(value);
    console.log('收到数据:', chunk);
    // 在这里更新UI显示流式内容
  }
}

// 普通响应处理
async function normalChat(message) {
  const response = await fetch('/llm/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: message,
      stream: false
    })
  });

  const data = await response.json();
  console.log('AI回复:', data.message);
  return data;
}
```

### React Hook 示例
```javascript
import { useState, useCallback } from 'react';

export function useGeminiChat() {
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState([]);

  const sendMessage = useCallback(async (message) => {
    setIsLoading(true);
    setMessages(prev => [...prev, { role: 'user', content: message }]);

    try {
      const response = await fetch('/llm/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, stream: true })
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let aiMessage = '';

      // 添加AI消息占位符
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        aiMessage += chunk;
        
        // 更新AI消息内容
        setMessages(prev => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1].content = aiMessage;
          return newMessages;
        });
      }
    } catch (error) {
      console.error('发送消息失败:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { messages, sendMessage, isLoading };
}
```

## 错误处理

常见错误码：
- `400`: 请求参数错误
- `500`: Gemini API密钥未配置或API调用失败

## 注意事项

1. **API密钥安全**: 
   - 绝不要在前端代码中暴露API密钥
   - 使用环境变量管理敏感信息

2. **流式响应**:
   - 确保前端正确处理流式数据
   - 注意网络连接中断的处理

3. **速率限制**:
   - Gemini API有调用频率限制
   - 建议在生产环境中添加速率限制中间件

4. **成本控制**:
   - 设置合理的max_tokens限制
   - 监控API使用量和成本
