import { GoogleGenAI } from "@google/genai";

// 注意：在实际生产环境中，请勿将 API Key 暴露在前端代码中。
// 本示例假定 process.env.API_KEY 已通过构建工具注入。
const apiKey = process.env.API_KEY || ''; 

let aiClient: GoogleGenAI | null = null;

export const initializeGemini = () => {
  if (apiKey && !aiClient) {
    aiClient = new GoogleGenAI({ apiKey });
  }
  return !!aiClient;
};

export const sendChatMessage = async (
  history: { role: string; content: string }[],
  newMessage: string,
  contextData?: string
): Promise<string> => {
  if (!aiClient) {
     // Fallback if no key provided to avoid crashing
     return "请先配置 API Key 以使用 AI 功能。";
  }

  try {
    const model = 'gemini-2.5-flash';
    const systemInstruction = `你是一个加密货币交易助手。
    当前市场上下文数据: ${contextData || '无数据'}
    请简短、专业地回答用户的交易相关问题。如果用户询问代码，请提供Node.js相关示例。`;

    // Convert simplified history to Gemini Chat format if needed, 
    // but here we use generateContent for single turn with context or chats.create for multi-turn.
    // Using generateContent for simplicity in this stateless function wrapper, 
    // but constructing a prompt that includes history is often better for simple implementing.
    
    // Correct approach using Chat:
    const chat = aiClient.chats.create({
      model: model,
      config: {
        systemInstruction: systemInstruction,
      },
      history: history.map(h => ({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.content }]
      }))
    });

    const result = await chat.sendMessage({ message: newMessage });
    return result.text || "无法生成回答。";

  } catch (error) {
    console.error("Gemini API Error:", error);
    return "AI 服务暂时不可用，请检查网络或 API Key。";
  }
};

export const analyzeMarketData = async (jsonEventData: string): Promise<string> => {
    if (!aiClient) return "AI 未初始化";
    
    try {
        const response = await aiClient.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `分析以下交易所原始JSON数据，指出异常或关键点: ${jsonEventData.substring(0, 1000)}`,
        });
        return response.text || "无分析结果";
    } catch (e) {
        return "分析失败";
    }
}