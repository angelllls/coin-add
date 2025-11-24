
import React, { useState, useEffect, useRef } from 'react';

interface SymbolSearchProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (symbol: string) => void;
}

// Mock Data Source for Search
const MOCK_PAIRS = [
  { s: 'BTC/USDT', n: 'Bitcoin', e: 'Binance', v: '1.2B' },
  { s: 'ETH/USDT', n: 'Ethereum', e: 'OKX', v: '800M' },
  { s: 'SOL/USDT', n: 'Solana', e: 'Binance', v: '400M' },
  { s: 'DOGE/USDT', n: 'Dogecoin', e: 'Bybit', v: '150M' },
  { s: 'XRP/USDT', n: 'Ripple', e: 'Binance', v: '200M' },
  { s: 'BNB/USDT', n: 'BNB', e: 'Binance', v: '100M' },
  { s: 'ADA/USDT', n: 'Cardano', e: 'OKX', v: '50M' },
  { s: 'AVAX/USDT', n: 'Avalanche', e: 'Binance', v: '45M' },
  { s: 'TRX/USDT', n: 'Tron', e: 'HTX', v: '30M' },
  { s: 'DOT/USDT', n: 'Polkadot', e: 'Binance', v: '25M' },
  { s: 'PEPE/USDT', n: 'Pepe', e: 'OKX', v: '120M' },
  { s: 'WIF/USDT', n: 'dogwifhat', e: 'Bybit', v: '80M' },
];

export const SymbolSearch: React.FC<SymbolSearchProps> = ({ isOpen, onClose, onSelect }) => {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState(MOCK_PAIRS);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50); // Small delay for animation
      setSearch('');
      setResults(MOCK_PAIRS);
    }
  }, [isOpen]);

  useEffect(() => {
    const lower = search.toLowerCase();
    const filtered = MOCK_PAIRS.filter(p => 
      p.s.toLowerCase().includes(lower) || 
      p.n.toLowerCase().includes(lower) ||
      p.e.toLowerCase().includes(lower)
    );
    setResults(filtered);
  }, [search]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm transition-opacity" onClick={onClose}>
      <div 
        className="w-[600px] max-h-[80vh] bg-bg-secondary border border-bg-tertiary rounded-lg shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-bg-tertiary flex items-center gap-3 bg-bg">
          <svg className="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent text-lg text-white outline-none placeholder-text-secondary"
            placeholder="搜索交易对 (e.g. BTC, ETH)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button onClick={onClose} className="px-2 py-1 text-xs bg-bg-tertiary text-text-secondary rounded hover:text-white border border-bg-tertiary">
            ESC
          </button>
        </div>

        {/* Categories */}
        <div className="flex gap-4 px-4 py-2 bg-bg border-b border-bg-tertiary text-xs text-text-secondary">
          <button className="text-accent font-bold border-b-2 border-accent pb-2 -mb-2.5 transition-colors">全部</button>
          <button className="hover:text-text-primary transition-colors">加密货币</button>
          <button className="hover:text-text-primary transition-colors">合约 (Perp)</button>
          <button className="hover:text-text-primary transition-colors">现货 (Spot)</button>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto bg-bg-secondary custom-scrollbar">
          {results.length > 0 ? (
            <table className="w-full text-left border-collapse">
              <thead className="text-xs text-text-secondary sticky top-0 bg-bg-secondary border-b border-bg-tertiary z-10">
                <tr>
                  <th className="px-4 py-2 font-medium bg-bg-secondary">交易对</th>
                  <th className="px-4 py-2 font-medium bg-bg-secondary">交易所</th>
                  <th className="px-4 py-2 font-medium text-right bg-bg-secondary">24h Vol</th>
                </tr>
              </thead>
              <tbody>
                {results.map((item, idx) => (
                  <tr 
                    key={idx}
                    onClick={() => { onSelect(item.s); onClose(); }}
                    className="cursor-pointer hover:bg-bg-tertiary transition-colors border-b border-bg-tertiary/30 last:border-0 group"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-accent font-bold text-xs ring-1 ring-accent/20">
                           {item.s.split('/')[0][0]}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-white group-hover:text-accent transition-colors">{item.s}</div>
                          <div className="text-xs text-text-secondary">{item.n}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                             <span className="px-1.5 py-0.5 rounded text-[10px] bg-bg border border-bg-tertiary text-text-secondary uppercase">
                                 {item.e}
                             </span>
                        </div>
                    </td>
                    <td className="px-4 py-3 text-right text-xs font-mono text-text-primary">
                        {item.v}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
             <div className="p-8 text-center text-text-secondary text-sm flex flex-col items-center gap-2">
                <svg className="w-10 h-10 text-bg-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <span>未找到相关交易对</span>
             </div>
          )}
        </div>
        
        <div className="p-2 border-t border-bg-tertiary bg-bg text-center text-[10px] text-text-secondary flex justify-between px-4">
           <span>Polaris Aggregator 搜索服务</span>
           <span>v2.1.0</span>
        </div>
      </div>
    </div>
  );
};
