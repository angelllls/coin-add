import React from 'react';

export const Docs: React.FC = () => {
  return (
    <div className="h-full overflow-y-auto p-8 bg-bg max-w-5xl mx-auto selection:bg-accent selection:text-white">
      <h1 className="text-3xl font-bold text-white mb-6">Polaris 交易所标准接口与后端规范 (v2.1)</h1>
      
      <div className="p-4 bg-green-900/30 border border-green-800 rounded mb-8">
        <h3 className="text-green-200 font-bold mb-2">更新日志</h3>
        <p className="text-sm text-green-100">
            [v2.1] 新增 OKX 交易所适配支持；
            新增 <code>AggregatorService</code> 多源数据聚合逻辑；
            完善 WebSocket 成交量聚合算法规范。
        </p>
      </div>

      <section className="mb-10">
        <h2 className="text-xl font-bold text-accent mb-4">1. 多源聚合架构 (Node.js Backend)</h2>
        <p className="text-text-secondary mb-4 text-sm">
           本系统采用微服务架构，后端负责高并发连接各大交易所(Binance, OKX, Bybit)，数据清洗后通过统一通道下发前端。
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-bg-secondary p-4 rounded border border-bg-tertiary">
                <h3 className="font-bold text-white mb-2">架构组件图</h3>
                <div className="text-xs font-mono text-blue-300 whitespace-pre">
{`
[Exchange A (Binance)] <─┐
                         │ (WS/REST)
[Exchange B (OKX)] <─────┼─> [Ingestion Workers] 
                         │    │ (Normalize)
[Exchange C (Bybit)] <───┘    │
                              ▼
                       [Redis Pub/Sub Channel]
                              │
                    [Aggregator Service] ◄─── (Merge Logic)
                              │
                    [WebSocket Gateway]
                              │
                         [Frontend]
`}
                </div>
            </div>
            <div className="bg-bg-secondary p-4 rounded border border-bg-tertiary">
                <h3 className="font-bold text-white mb-2">聚合策略 (Aggregation Logic)</h3>
                <ul className="list-disc list-inside text-text-secondary text-sm space-y-2">
                    <li><strong>价格锚定 (Price Anchor)</strong>: 选取流动性最好的交易所（如 Binance）作为主价格源，维持 K 线形态。</li>
                    <li><strong>成交量聚合 (Volume Aggregation)</strong>: <code className="text-accent">Vol_Total = Vol_Bin + Vol_Okx + ...</code></li>
                    <li><strong>时间对齐</strong>: 基于 1m/5m 时间戳窗口，丢弃延迟超过阈值的数据包。</li>
                </ul>
            </div>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-bold text-accent mb-4">2. 交易所适配器接口 (IExchangeAdapter)</h2>
        <p className="text-text-secondary mb-4">
            任何新增交易所必须实现此接口。前端 <code>services/*.ts</code> 与后端 TypeScript 模块共用此定义。
        </p>
        <div className="bg-bg-secondary p-4 rounded border border-bg-tertiary relative">
            <pre className="text-sm font-mono text-blue-300 overflow-x-auto">
{`interface IExchangeAdapter {
  // 基础属性
  name: string;
  
  // 连接管理
  connect(symbol: string, interval: string): Promise<boolean>;
  disconnect(): void;
  
  // 标准化数据流订阅
  subscribeTicker(cb: (ticker: Ticker) => void): void;
  subscribeCandles(cb: (candle: Candle) => void): void;
  
  // 原始数据调试流
  subscribeRawJson(cb: (event: ExchangeEvent) => void): void;
}

// 统一数据结构
interface Ticker {
  symbol: string;
  price: number;
  volume24h: number; // 聚合后为全网成交量
  exchange: string;  // "Binance" 或 "Aggregated"
  timestamp: number;
}`}
            </pre>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-bold text-accent mb-4">3. 核心算法代码规范</h2>
        
        <div className="space-y-6">
            <div>
                <h3 className="text-white font-bold mb-2">WebSocket 聚合成交量函数</h3>
                <p className="text-text-secondary text-sm mb-2">
                    后端实现逻辑：使用 Redis 原子计数器或内存 Window 聚合。
                </p>
                <div className="bg-bg-secondary p-4 rounded border border-bg-tertiary">
<pre className="text-sm font-mono text-green-300">
{`class VolumeAggregator {
  private buckets = new Map<number, number>(); // timestamp -> volume

  public onTrade(exchange: string, trade: Trade) {
    // 将交易时间归一化到分钟级别 (60000ms)
    const timeBucket = Math.floor(trade.time / 60000) * 60000;
    
    const currentVol = this.buckets.get(timeBucket) || 0;
    const newVol = currentVol + trade.amount;
    
    this.buckets.set(timeBucket, newVol);
    
    // 触发更新事件给前端
    this.emit('update', { time: timeBucket, vol: newVol });
  }

  public cleanup() {
    // 清理过期的 bucket
  }
}`}
</pre>
                </div>
            </div>

            <div>
                <h3 className="text-white font-bold mb-2">外部 API 扩展</h3>
                <div className="bg-bg-secondary p-4 rounded border border-bg-tertiary">
                    <pre className="text-sm font-mono text-purple-300">
{`// POST /api/v1/exchange/connect
{
  "exchange": "bybit",
  "apiKey": "EncryptedString...",
  "status": "active"
}

// GET /api/v1/market/aggregated?symbol=BTC-USDT
{
  "price": 64200.50,
  "sources": {
    "binance": {"price": 64201.00, "vol": 5000},
    "okx": {"price": 64198.50, "vol": 3000}
  },
  "totalVolume": 8000
}`}
                    </pre>
                </div>
            </div>
        </div>
      </section>
    </div>
  );
};