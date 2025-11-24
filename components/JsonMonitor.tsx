import React, { useEffect, useState, useRef } from 'react';
import { ExchangeEvent } from '../types';
import { analyzeMarketData } from '../services/geminiService';

interface JsonMonitorProps {
  events: ExchangeEvent[];
  onClear: () => void;
}

export const JsonMonitor: React.FC<JsonMonitorProps> = ({ events, onClear }) => {
  const endRef = useRef<HTMLDivElement>(null);
  const [selectedEvent, setSelectedEvent] = useState<ExchangeEvent | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<string>("");
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    if (endRef.current) {
      endRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [events]);

  const handleAnalyze = async () => {
    if(!selectedEvent) return;
    setAnalyzing(true);
    const res = await analyzeMarketData(JSON.stringify(selectedEvent));
    setAiAnalysis(res);
    setAnalyzing(false);
  };

  return (
    <div className="grid grid-cols-2 h-full gap-1 p-1">
      {/* Log Stream */}
      <div className="bg-bg-secondary rounded border border-bg-tertiary flex flex-col overflow-hidden">
        <div className="p-2 border-b border-bg-tertiary flex justify-between items-center bg-bg">
          <h3 className="text-sm font-bold text-text-primary">WebSocket 数据流</h3>
          <button onClick={onClear} className="text-xs text-red-400 hover:text-red-300">清空日志</button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 font-mono text-xs space-y-1">
          {events.map((evt, idx) => (
            <div 
              key={idx} 
              onClick={() => { setSelectedEvent(evt); setAiAnalysis(""); }}
              className={`cursor-pointer p-1 rounded hover:bg-bg-tertiary truncate transition-colors ${selectedEvent === evt ? 'bg-bg-tertiary border-l-2 border-accent' : ''}`}
            >
              <span className="text-text-secondary">[{new Date(evt.timestamp).toLocaleTimeString()}]</span>
              <span className={`ml-2 font-bold ${evt.type === 'trade' ? 'text-purple-400' : evt.type === 'ticker' ? 'text-green-400' : 'text-blue-400'}`}>
                {evt.type.toUpperCase()}
              </span>
              <span className="ml-2 text-gray-500">@{evt.source}</span>
            </div>
          ))}
          <div ref={endRef} />
        </div>
      </div>

      {/* Detail View */}
      <div className="bg-bg-secondary rounded border border-bg-tertiary flex flex-col overflow-hidden">
         <div className="p-2 border-b border-bg-tertiary bg-bg flex justify-between items-center">
            <h3 className="text-sm font-bold text-text-primary">JSON 详情</h3>
            {selectedEvent && (
                <button 
                    onClick={handleAnalyze} 
                    disabled={analyzing}
                    className="px-2 py-0.5 bg-accent rounded text-xs text-white hover:bg-accent-hover disabled:opacity-50"
                >
                    {analyzing ? 'AI分析中...' : 'AI 诊断'}
                </button>
            )}
         </div>
         <div className="flex-1 overflow-y-auto p-4">
            {selectedEvent ? (
                <>
                    <pre className="text-xs font-mono text-green-300 whitespace-pre-wrap break-all">
                        {JSON.stringify(selectedEvent, null, 2)}
                    </pre>
                    
                    {aiAnalysis && (
                        <div className="mt-4 p-3 bg-bg-tertiary rounded border-l-2 border-accent">
                            <h4 className="text-xs font-bold text-white mb-1">Gemini 分析报告:</h4>
                            <p className="text-xs text-text-primary leading-relaxed">{aiAnalysis}</p>
                        </div>
                    )}
                </>
            ) : (
                <div className="h-full flex items-center justify-center text-text-secondary text-sm">
                    请在左侧选择一条日志查看详情
                </div>
            )}
         </div>
      </div>
    </div>
  );
};