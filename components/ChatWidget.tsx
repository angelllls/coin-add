import React, { useState, useRef, useEffect } from 'react';
import { sendChatMessage } from '../services/geminiService';
import { ChatMessage } from '../types';

interface ChatWidgetProps {
  marketContext: string;
}

export const ChatWidget: React.FC<ChatWidgetProps> = ({ marketContext }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: '0', role: 'system', content: '你好！我是 Polaris AI 助手。我可以帮你分析行情或查询数据。', timestamp: Date.now() }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages, isOpen]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    // Call Gemini Service
    const history = messages.filter(m => m.role !== 'system');
    const responseText = await sendChatMessage(history, userMsg.content, marketContext);

    const aiMsg: ChatMessage = {
      id: (Date.now() + 1).toString(),
      role: 'model',
      content: responseText,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, aiMsg]);
    setLoading(false);
  };

  return (
    <div className={`fixed bottom-6 right-6 flex flex-col items-end z-50 transition-all ${isOpen ? 'w-80 h-96' : 'w-auto h-auto'}`}>
      {isOpen && (
        <div className="w-full h-full bg-bg-secondary border border-bg-tertiary rounded-lg shadow-xl flex flex-col mb-4 overflow-hidden">
          {/* Header */}
          <div className="p-3 bg-bg-tertiary flex justify-between items-center">
            <span className="font-medium text-sm text-white flex items-center gap-2">
               <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
               AI 助手 (Gemini 2.5)
            </span>
            <button onClick={() => setIsOpen(false)} className="text-text-secondary hover:text-white">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-bg-secondary">
            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] p-2 rounded text-xs leading-relaxed ${
                  msg.role === 'user' 
                    ? 'bg-accent text-white rounded-br-none' 
                    : 'bg-bg-tertiary text-text-primary rounded-bl-none'
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-bg-tertiary p-2 rounded text-xs text-text-secondary">
                  思考中...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-2 bg-bg border-t border-bg-tertiary flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="输入指令，例如：分析当前趋势..."
              className="flex-1 bg-bg-tertiary text-white text-xs p-2 rounded outline-none focus:ring-1 focus:ring-accent"
            />
            <button onClick={handleSend} disabled={loading} className="bg-accent px-3 py-1 rounded text-white hover:bg-accent-hover disabled:opacity-50">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
            </button>
          </div>
        </div>
      )}

      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="bg-accent hover:bg-accent-hover text-white p-3 rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-110"
      >
        {isOpen ? (
           <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
        ) : (
           <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
        )}
      </button>
    </div>
  );
};