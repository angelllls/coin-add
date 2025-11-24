import React from 'react';

interface HeaderProps {
  activeTab: 'dashboard' | 'monitor' | 'docs';
  setActiveTab: (tab: 'dashboard' | 'monitor' | 'docs') => void;
  pair: string;
  price: number;
}

export const Header: React.FC<HeaderProps> = ({ activeTab, setActiveTab, pair, price }) => {
  return (
    <header className="flex items-center justify-between h-12 px-4 border-b border-bg-tertiary bg-bg-secondary select-none">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          {/* Logo Icon */}
          <svg className="w-6 h-6 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span className="font-bold text-lg tracking-tight text-white">Polaris Trade</span>
        </div>
        
        <nav className="flex gap-1 bg-bg-tertiary p-1 rounded-md">
          {['dashboard', 'monitor', 'docs'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                activeTab === tab 
                  ? 'bg-bg text-white shadow-sm' 
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {tab === 'dashboard' && '交易终端'}
              {tab === 'monitor' && '数据监控'}
              {tab === 'docs' && '接口文档'}
            </button>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-2">
            <span className="font-bold text-white">{pair}</span>
            <span className={`font-mono ${price > 0 ? 'text-trade-up' : 'text-trade-down'}`}>
                ${price.toFixed(2)}
            </span>
        </div>
        <div className="w-px h-4 bg-bg-tertiary mx-2"></div>
        <button className="text-text-secondary hover:text-accent text-xs">连接钱包</button>
        <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-white font-bold text-xs">
          USER
        </div>
      </div>
    </header>
  );
};