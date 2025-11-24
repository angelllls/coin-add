import { Candle, ChartInterval, ExchangeEvent, IExchangeAdapter, Ticker } from '../types';

/**
 * 这是一个模拟后端服务的类。
 * 在真实场景中，这里会是一个连接到 Node.js 后端的 WebSocket 客户端。
 * 后端 Node.js 服务会通过 REST/WS 并行连接 OKX, Binance, Bybit，
 * 将数据清洗聚合后，通过单一 WebSocket 推送给前端。
 */
export class MockExchangeService implements IExchangeAdapter {
  name: string = "Polaris Aggregator (Simulated)";
  private intervalId: any = null;
  private currentSymbol: string = "BTC/USDT";
  private currentInterval: string = ChartInterval._1m;
  private lastCandle: Candle | null = null;
  private isActive: boolean = false;

  // Event Emitters
  private tickerCallbacks: ((ticker: Ticker) => void)[] = [];
  private candleCallbacks: ((candle: Candle) => void)[] = [];
  private jsonCallbacks: ((event: ExchangeEvent) => void)[] = [];

  constructor() {
    // Initialize with some dummy data
    this.lastCandle = {
      time: Date.now(),
      open: 65000,
      high: 65100,
      low: 64900,
      close: 65050,
      volume: 100,
    };
  }

  async connect(symbol: string, interval: string): Promise<boolean> {
    this.disconnect(); // Close previous
    this.isActive = true;
    this.currentSymbol = symbol;
    this.currentInterval = interval;
    
    console.log(`[Exchange] Connected to ${symbol} @ ${interval}`);
    this.emitJson({ type: 'status', data: { status: 'connected', symbol, interval }, source: 'System', timestamp: Date.now() });

    // Simulate Initial Historical Data Fetch
    this.emitJson({ type: 'status', data: { message: 'Fetching History...' }, source: 'System', timestamp: Date.now() });
    
    // Generate historical data immediately
    const history = this.generateHistory(100);
    history.forEach(c => {
        this.candleCallbacks.forEach(cb => cb(c));
    });

    // Start "WebSocket" heartbeat
    this.intervalId = setInterval(() => {
      this.tick();
    }, 1000); // Update every second

    return true;
  }

  disconnect(): void {
    if (this.intervalId) clearInterval(this.intervalId);
    this.isActive = false;
    this.emitJson({ type: 'status', data: { status: 'disconnected' }, source: 'System', timestamp: Date.now() });
  }

  subscribeTicker(callback: (ticker: Ticker) => void): void {
    this.tickerCallbacks.push(callback);
  }

  subscribeCandles(callback: (candle: Candle) => void): void {
    this.candleCallbacks.push(callback);
  }

  subscribeRawJson(callback: (event: ExchangeEvent) => void): void {
    this.jsonCallbacks.push(callback);
  }

  private emitJson(event: ExchangeEvent) {
    this.jsonCallbacks.forEach(cb => cb(event));
  }

  private tick() {
    if (!this.isActive || !this.lastCandle) return;

    // 1. Update current candle (Realtime simulation)
    const volatility = 20; // Random fluctuation
    const change = (Math.random() - 0.5) * volatility;
    let newPrice = this.lastCandle.close + change;

    // Update High/Low of current candle
    this.lastCandle.close = newPrice;
    this.lastCandle.high = Math.max(this.lastCandle.high, newPrice);
    this.lastCandle.low = Math.min(this.lastCandle.low, newPrice);
    this.lastCandle.volume += Math.random() * 5;

    // Emit updates
    const ticker: Ticker = {
      symbol: this.currentSymbol,
      price: newPrice,
      change24h: ((newPrice - 64000) / 64000) * 100, // Mock logic
      volume24h: 500000000,
      timestamp: Date.now(),
      exchange: 'Binance' // Mock source
    };

    this.tickerCallbacks.forEach(cb => cb(ticker));
    this.candleCallbacks.forEach(cb => cb({ ...this.lastCandle! })); // Emit copy
    
    // Debug Stream
    this.emitJson({ type: 'ticker', data: ticker, source: 'Binance', timestamp: Date.now() });
    if(Math.random() > 0.7) {
       this.emitJson({ type: 'trade', data: { side: Math.random() > 0.5 ? 'buy' : 'sell', amount: Math.random().toFixed(4), price: newPrice.toFixed(2) }, source: 'OKX', timestamp: Date.now() });
    }

    // 2. Check if we need to close the candle and start a new one
    // For simulation, we just close it every 5 seconds (to make demo faster than 1m)
    // In real app, this checks Date.now() % interval
    if (Date.now() - this.lastCandle.time > 5000) {
      const nextOpen = this.lastCandle.close;
      this.lastCandle = {
        time: Date.now(),
        open: nextOpen,
        high: nextOpen,
        low: nextOpen,
        close: nextOpen,
        volume: 0
      };
    }
  }

  private generateHistory(count: number): Candle[] {
    const history: Candle[] = [];
    let price = 65000;
    let time = Date.now() - (count * 60000); // 1m interval mock

    for (let i = 0; i < count; i++) {
      const open = price;
      const close = price + (Math.random() - 0.5) * 100;
      const high = Math.max(open, close) + Math.random() * 20;
      const low = Math.min(open, close) - Math.random() * 20;
      const volume = Math.random() * 1000;
      
      history.push({
        time,
        open,
        high,
        low,
        close,
        volume
      });
      
      price = close;
      time += 60000;
    }
    this.lastCandle = { ...history[history.length - 1], time: Date.now() };
    return history;
  }
}

export const exchangeService = new MockExchangeService();