
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Header } from './components/Header';
import { CandlestickChart } from './components/CandlestickChart';
import { ChatWidget } from './components/ChatWidget';
import { JsonMonitor } from './components/JsonMonitor';
import { Docs } from './components/Docs';
import { SymbolSearch } from './components/SymbolSearch';
import { aggregatorService } from './services/aggregatorService'; 
import { initializeGemini } from './services/geminiService';
import { applyIndicators } from './services/indicatorService';
import { Candle, ExchangeEvent, Ticker, IndicatorConfig, ChartStyle, DrawingToolType } from './types';

function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'monitor' | 'docs'>('dashboard');
  
  // Market Data State
  const [candles, setCandles] = useState<Candle[]>([]);
  const [ticker, setTicker] = useState<Ticker | null>(null);
  const [events, setEvents] = useState<ExchangeEvent[]>([]);
  const [pair, setPair] = useState('BTC/USDT');
  
  // Chart Configuration State
  const [interval, setInterval] = useState('5m'); 
  const [chartStyle, setChartStyle] = useState<ChartStyle>('candle_solid');
  const [activeIndicators, setActiveIndicators] = useState<IndicatorConfig[]>([
    { id: 'ma7', name: 'MA 7', type: 'SMA', period: 7, color: '#f59e0b' },
    { id: 'ma25', name: 'MA 25', type: 'SMA', period: 25, color: '#8b5cf6' },
  ]);
  const [showIndicatorMenu, setShowIndicatorMenu] = useState(false);
  const [showStyleMenu, setShowStyleMenu] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  // Tool State
  const [selectedTool, setSelectedTool] = useState<DrawingToolType>('cursor');

  // Available Indicators
  const availableIndicators: IndicatorConfig[] = [
    { id: 'ma7', name: 'MA 7', type: 'SMA', period: 7, color: '#f59e0b' },
    { id: 'ma25', name: 'MA 25', type: 'SMA', period: 25, color: '#8b5cf6' },
    { id: 'ma99', name: 'MA 99', type: 'SMA', period: 99, color: '#3b82f6' },
    { id: 'ema20', name: 'EMA 20', type: 'EMA', period: 20, color: '#10b981' },
    { id: 'ema50', name: 'EMA 50', type: 'EMA', period: 50, color: '#ec4899' },
    { id: 'vwap20', name: 'Agg VWAP', type: 'VWAP', period: 20, color: '#ffffff', lineWidth: 2 },
  ];

  const toggleIndicator = (ind: IndicatorConfig) => {
    if (activeIndicators.find(i => i.id === ind.id)) {
        setActiveIndicators(prev => prev.filter(i => i.id !== ind.id));
    } else {
        setActiveIndicators(prev => [...prev, ind]);
    }
  };

  const handleUpdateIndicator = (updated: IndicatorConfig) => {
      setActiveIndicators(prev => prev.map(i => i.id === updated.id ? updated : i));
  };

  useEffect(() => {
    initializeGemini();
  }, []);

  useEffect(() => {
    setCandles([]); 
    
    // Connect to Aggregator
    aggregatorService.connect(pair, interval);

    const handleTicker = (newTicker: Ticker) => {
      setTicker(newTicker);
    };

    const handleCandle = (newCandle: Candle) => {
      setCandles((prev) => {
        if (prev.length === 0) return [newCandle];
        const last = prev[prev.length - 1];
        if (last.time === newCandle.time) {
          const updated = [...prev];
          updated[updated.length - 1] = newCandle;
          return updated;
        } else if (newCandle.time > last.time) {
          const updated = [...prev, newCandle];
          return updated.slice(-500); 
        } else {
            return prev;
        }
      });
    };

    const handleJson = (event: ExchangeEvent) => {
      setEvents((prev) => [event, ...prev].slice(0, 50));
    };

    aggregatorService.subscribeTicker(handleTicker);
    aggregatorService.subscribeCandles(handleCandle);
    aggregatorService.subscribeRawJson(handleJson);

    return () => {
      aggregatorService.disconnect();
    };
  }, [pair, interval]); 

  const processedCandles = useMemo(() => {
    return applyIndicators(candles, activeIndicators);
  }, [candles, activeIndicators]);

  const getMarketContext = useCallback(() => {
    if (!ticker) return "数据连接中...";
    return `Mode: Aggregation (Binance+OKX)
    交易对: ${ticker.symbol}
    周期: ${interval}
    当前价格: $${ticker.price.toFixed(2)}
    24h 聚合成交量: ${ticker.volume24h.toFixed(0)}`;
  }, [ticker, interval]);

  const ToolButton = ({ tool, icon, label }: { tool: DrawingToolType, icon: React.ReactNode, label: string }) => (
    <button 
      onClick={() => setSelectedTool(tool)}
      className={`w-10 h-10 flex items-center justify-center rounded transition-all duration-200 relative group ${
        selectedTool === tool 
          ? 'text-accent bg-bg-tertiary shadow-lg border border-accent/20' 
          : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
      }`}
    >
      {icon}
      <span className="absolute left-full ml-3 px-2 py-1 bg-black border border-bg-tertiary text-xs text-white rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
        {label}
      </span>
    </button>
  );

  return (
    <div className="flex flex-col h-screen bg-bg text-text-primary overflow-hidden font-sans">
      <Header 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        pair={pair} 
        price={ticker?.price || 0} 
      />

      <main className="flex-1 relative overflow-hidden">
        {activeTab === 'dashboard' && (
          <div className="grid grid-cols-12 grid-rows-12 h-full gap-0.5 bg-bg-tertiary">
            
            {/* Left Toolbar */}
            <div className="col-span-1 row-span-12 w-[52px] bg-bg-secondary border-r border-bg-tertiary flex flex-col items-center py-4 gap-2 select-none z-20 shadow-md">
               <ToolButton 
                 tool="cursor" 
                 label="十字光标 (Pan/Drag)"
                 icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>}
               />
               <div className="w-8 h-px bg-bg-tertiary my-1" />
               <ToolButton 
                 tool="trendline" 
                 label="趋势线 (Click start & end)"
                 icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 20L20 4" /><circle cx="4" cy="20" r="2" fill="currentColor"/><circle cx="20" cy="4" r="2" fill="currentColor"/></svg>}
               />
               <ToolButton 
                 tool="fib" 
                 label="斐波那契回撤"
                 icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4h16M4 9h16M4 14h16M4 19h16" /></svg>}
               />
               <ToolButton 
                 tool="text" 
                 label="文本注释"
                 icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16m-7 6h7" /></svg>}
               />
               <div className="w-8 h-px bg-bg-tertiary my-1" />
               <ToolButton 
                 tool="eraser" 
                 label="橡皮擦 (Click to delete)"
                 icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>}
               />
            </div>

            {/* Main Chart Area */}
            <div className="col-span-11 md:col-span-8 lg:col-span-9 row-span-8 md:row-span-12 bg-bg-secondary relative flex flex-col">
              {/* Chart Header Toolbar */}
              <div className="h-12 border-b border-bg-tertiary flex items-center px-4 gap-2 bg-bg-secondary shrink-0 select-none z-30">
                
                {/* Symbol Selector - Opens Modal */}
                <div 
                    onClick={() => setShowSearch(true)}
                    className="flex items-center gap-2 mr-4 cursor-pointer hover:bg-bg-tertiary px-2 py-1 rounded transition-colors group"
                >
                    <div className="w-5 h-5 rounded-full bg-accent/20 flex items-center justify-center text-accent text-[10px] font-bold ring-1 ring-accent/30 group-hover:ring-accent">
                        {pair[0]}
                    </div>
                    <span className="font-bold text-white">{pair.replace('/','')}</span>
                    <span className="text-[10px] bg-bg-tertiary text-text-secondary px-1.5 py-0.5 rounded border border-bg-tertiary/50">PERP</span>
                    <svg className="w-3 h-3 text-text-secondary group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </div>

                <div className="w-px h-5 bg-bg-tertiary mx-2" />

                {/* Intervals */}
                <div className="flex gap-0.5">
                    {['1m', '5m', '15m', '1h', '4h', '1d'].map(i => (
                        <button 
                            key={i}
                            onClick={() => setInterval(i)}
                            className={`px-3 py-1.5 rounded text-xs font-medium hover:bg-bg-tertiary hover:text-accent transition-colors ${interval === i ? 'text-accent bg-transparent font-bold' : 'text-text-secondary'}`}
                        >
                            {i}
                        </button>
                    ))}
                </div>

                <div className="w-px h-5 bg-bg-tertiary mx-2" />
                
                {/* Chart Style */}
                <div className="relative group z-40">
                    <button 
                        onClick={() => setShowStyleMenu(!showStyleMenu)}
                        className="flex items-center gap-1 text-sm text-text-secondary hover:text-accent hover:bg-bg-tertiary px-2 py-1 rounded transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                    </button>
                    {showStyleMenu && (
                        <div className="absolute top-full left-0 mt-1 w-40 bg-bg-secondary border border-bg-tertiary rounded shadow-xl py-1">
                             {[
                                 { id: 'candle_solid', label: '实心蜡烛' },
                                 { id: 'candle_hollow', label: '空心蜡烛' },
                                 { id: 'heikin_ashi', label: '平均K线 (Heikin)' },
                                 { id: 'line', label: '线形图' },
                             ].map(s => (
                                 <button
                                     key={s.id}
                                     onClick={() => { setChartStyle(s.id as any); setShowStyleMenu(false); }}
                                     className={`w-full text-left px-4 py-2 text-sm hover:bg-bg-tertiary ${chartStyle === s.id ? 'text-accent' : 'text-text-primary'}`}
                                 >
                                     {s.label}
                                 </button>
                             ))}
                        </div>
                    )}
                </div>

                {/* Indicators Menu */}
                <div className="relative group z-40">
                    <button 
                        onClick={() => setShowIndicatorMenu(!showIndicatorMenu)}
                        className="flex items-center gap-1 text-sm text-text-secondary hover:text-accent hover:bg-bg-tertiary px-2 py-1 rounded transition-colors"
                    >
                        <span className="font-mono italic font-bold">fx</span>
                        指标
                    </button>
                    {showIndicatorMenu && (
                        <div className="absolute top-full left-0 mt-1 w-56 bg-bg-secondary border border-bg-tertiary rounded shadow-xl py-1">
                            <div className="px-3 py-2 text-xs text-text-secondary border-b border-bg-tertiary font-bold">FAVORITES</div>
                            {availableIndicators.map(ind => {
                                const isActive = activeIndicators.some(i => i.id === ind.id);
                                return (
                                    <div 
                                        key={ind.id}
                                        onClick={() => toggleIndicator(ind)}
                                        className="px-4 py-2 text-sm text-text-primary hover:bg-bg-tertiary cursor-pointer flex items-center justify-between group/item"
                                    >
                                        <span className="flex items-center gap-2">
                                            <span className={`w-3 h-3 rounded-full border ${isActive ? 'border-transparent' : 'border-text-secondary'}`} style={{background: isActive ? ind.color : 'transparent'}}></span>
                                            {ind.name}
                                        </span>
                                        {isActive && <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
              </div>

              {/* Chart Content */}
              <div className="flex-1 w-full min-h-0 relative group" onClick={() => { setShowIndicatorMenu(false); setShowStyleMenu(false); }}>
                 {/* Quick Trade Panel */}
                 {ticker && (
                    <div className="absolute top-4 left-4 z-20 flex flex-col gap-1 shadow-lg pointer-events-none opacity-50 group-hover:opacity-100 transition-opacity">
                        <div className="flex pointer-events-auto shadow-xl rounded overflow-hidden">
                            <button className="bg-bg-secondary border border-trade-down/30 text-trade-down hover:bg-trade-down hover:text-white px-3 py-1 text-left min-w-[90px] transition-colors">
                                <div className="text-[10px] opacity-80 mb-0.5">卖出 (Short)</div>
                                <div className="font-bold font-mono text-sm">{ticker.price.toFixed(2)}</div>
                            </button>
                            <div className="bg-bg-tertiary px-2 flex items-center justify-center text-xs text-text-secondary font-mono border-y border-bg-tertiary">
                                0.1
                            </div>
                            <button className="bg-bg-secondary border border-trade-up/30 text-trade-up hover:bg-trade-up hover:text-white px-3 py-1 text-right min-w-[90px] transition-colors">
                                <div className="text-[10px] opacity-80 mb-0.5">买入 (Long)</div>
                                <div className="font-bold font-mono text-sm">{(ticker.price + 0.5).toFixed(2)}</div>
                            </button>
                        </div>
                    </div>
                 )}

                 {candles.length > 0 ? (
                   <CandlestickChart 
                        data={processedCandles} 
                        indicators={activeIndicators}
                        onUpdateIndicator={handleUpdateIndicator}
                        selectedTool={selectedTool}
                        chartStyle={chartStyle}
                   />
                 ) : (
                   <div className="flex flex-col items-center justify-center h-full text-text-secondary gap-2">
                        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-sm font-medium">正在建立数据流连接...</span>
                   </div>
                 )}
              </div>
            </div>

            {/* Right Side: Orderbook / Depth */}
            <div className="col-span-12 md:col-span-3 lg:col-span-2 row-span-4 md:row-span-12 bg-bg-secondary border-l border-bg-tertiary flex flex-col">
               <div className="h-12 border-b border-bg-tertiary flex items-center px-3 bg-bg-secondary shrink-0">
                   <span className="text-sm font-medium text-white">Order Book</span>
               </div>
               
               <div className="grid grid-cols-3 px-2 py-1.5 text-[10px] text-text-secondary mb-1 bg-bg-tertiary/20">
                   <span>Price(USDT)</span>
                   <span className="text-right">Amount</span>
                   <span className="text-right">Total</span>
               </div>

               <div className="flex-1 overflow-hidden text-xs font-mono relative">
                  <div className="flex flex-col-reverse justify-end pb-1 h-1/2 overflow-hidden">
                     {[...Array(15)].map((_, i) => {
                        const p = (ticker?.price || 65000) + (i+1)*1.5;
                        const a = Math.random() * 2;
                        return (
                           <div key={`ask-${i}`} className="grid grid-cols-3 px-2 py-[1px] hover:bg-bg-tertiary cursor-pointer relative group">
                               <div className="absolute top-0 right-0 bottom-0 bg-trade-down/10 z-0 transition-all duration-500" style={{width: `${Math.random()*100}%`}}></div>
                               <span className="text-trade-down z-10 group-hover:font-bold">{p.toFixed(1)}</span>
                               <span className="text-right text-text-primary z-10 opacity-80">{a.toFixed(3)}</span>
                               <span className="text-right text-text-secondary z-10">{(a*p/1000).toFixed(1)}K</span>
                           </div>
                        )
                     })}
                  </div>

                  <div className="border-y border-bg-tertiary py-1.5 flex items-center justify-center gap-2 bg-bg-tertiary/30 my-1">
                     <span className={`text-lg font-bold ${ticker?.change24h && ticker.change24h >= 0 ? 'text-trade-up' : 'text-trade-down'}`}>
                        {ticker?.price.toFixed(2)}
                     </span>
                     <svg className={`w-4 h-4 ${ticker?.change24h && ticker.change24h >= 0 ? 'text-trade-up rotate-180' : 'text-trade-down'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
                  </div>

                  <div className="flex flex-col pt-1 h-1/2 overflow-hidden">
                     {[...Array(15)].map((_, i) => {
                        const p = (ticker?.price || 65000) - (i+1)*1.5;
                        const a = Math.random() * 3;
                        return (
                           <div key={`bid-${i}`} className="grid grid-cols-3 px-2 py-[1px] hover:bg-bg-tertiary cursor-pointer relative group">
                               <div className="absolute top-0 right-0 bottom-0 bg-trade-up/10 z-0 transition-all duration-500" style={{width: `${Math.random()*100}%`}}></div>
                               <span className="text-trade-up z-10 group-hover:font-bold">{p.toFixed(1)}</span>
                               <span className="text-right text-text-primary z-10 opacity-80">{a.toFixed(3)}</span>
                               <span className="text-right text-text-secondary z-10">{(a*p/1000).toFixed(1)}K</span>
                           </div>
                        )
                     })}
                  </div>
               </div>
            </div>
          </div>
        )}

        {activeTab === 'monitor' && <JsonMonitor events={events} onClear={() => setEvents([])} />}
        {activeTab === 'docs' && <Docs />}
      </main>

      <ChatWidget marketContext={getMarketContext()} />
      <SymbolSearch 
        isOpen={showSearch} 
        onClose={() => setShowSearch(false)} 
        onSelect={(s) => setPair(s)} 
      />
    </div>
  );
}

export default App;
