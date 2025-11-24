import { Candle, ExchangeEvent, IExchangeAdapter, Ticker } from '../types';

export class BybitService implements IExchangeAdapter {
  name: string = "Bybit (Real-Time)";
  private ws: WebSocket | null = null;
  private currentSymbol: string = "";
  private currentInterval: string = "";
  private pingInterval: any = null;

  private tickerCallbacks: ((ticker: Ticker) => void)[] = [];
  private candleCallbacks: ((candle: Candle) => void)[] = [];
  private jsonCallbacks: ((event: ExchangeEvent) => void)[] = [];

  // Bybit uses "BTCUSDT" for linear perps usually, but let's be robust
  private normalizeSymbol(symbol: string): string {
    return symbol.replace('/', '').toUpperCase();
  }

  // Bybit Intervals: 1, 3, 5, 15, 30, 60, 120, 240, 360, 720, D, M, W
  private normalizeInterval(interval: string): string {
    if (interval === '1m') return '1';
    if (interval === '5m') return '5';
    if (interval === '15m') return '15';
    if (interval === '1h') return '60';
    if (interval === '4h') return '240';
    if (interval === '1d') return 'D';
    return '5';
  }

  async connect(symbol: string, interval: string): Promise<boolean> {
    this.disconnect();
    
    this.currentSymbol = symbol;
    this.currentInterval = interval;
    const bybitSymbol = this.normalizeSymbol(symbol);
    const bybitInterval = this.normalizeInterval(interval);

    this.emitJson({ type: 'status', data: { status: 'connecting', symbol: bybitSymbol }, source: 'System', timestamp: Date.now() });

    // Public V5 Linear stream
    const wsUrl = `wss://stream.bybit.com/v5/public/linear`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log(`[Bybit] Connected`);
      this.emitJson({ type: 'status', data: { status: 'connected_ws' }, source: 'Bybit WS', timestamp: Date.now() });
      
      // Subscribe Ticker
      // topic: tickers.{symbol}
      const tickerSub = {
        op: "subscribe",
        args: [`tickers.${bybitSymbol}`]
      };
      this.ws?.send(JSON.stringify(tickerSub));

      // Subscribe Candle
      // topic: kline.{interval}.{symbol}
      const candleSub = {
        op: "subscribe",
        args: [`kline.${bybitInterval}.${bybitSymbol}`]
      };
      this.ws?.send(JSON.stringify(candleSub));

      // Heartbeat every 20s
      this.pingInterval = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ op: "ping" }));
        }
      }, 20000);
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        
        if (msg.op === 'pong' || msg.success) return; 

        if (msg.topic && msg.data) {
          if (msg.topic.startsWith('tickers')) {
             this.handleTicker(msg.data);
          } else if (msg.topic.startsWith('kline')) {
             this.handleCandle(msg.data);
          }

          // Debug Stream
          if (Math.random() > 0.9) {
            this.emitJson({ 
                type: msg.topic.startsWith('kline') ? 'candle' : 'ticker', 
                data: msg.data, 
                source: 'Bybit', 
                timestamp: Date.now() 
            });
          }
        }
      } catch (e) {
        // console.error("Bybit Parse Error", e);
      }
    };

    this.ws.onclose = () => {
        this.emitJson({ type: 'status', data: { status: 'disconnected' }, source: 'Bybit System', timestamp: Date.now() });
    };

    return true;
  }

  private handleTicker(data: any) {
    // Bybit Ticker Data is a list, usually length 1
    // { symbol: 'BTCUSDT', lastPrice: '...', highPrice24h: '...', lowPrice24h: '...', volume24h: '...', turnover24h: '...' }
    const t = data; 
    // Bybit sends delta updates sometimes, but snapshot usually has full fields. 
    // We safeguard against missing fields if delta.
    if (!t.lastPrice) return;

    const ticker: Ticker = {
        symbol: this.currentSymbol,
        price: parseFloat(t.lastPrice),
        change24h: parseFloat(t.price24hPcnt) * 100,
        volume24h: parseFloat(t.volume24h),
        high24h: parseFloat(t.highPrice24h),
        low24h: parseFloat(t.lowPrice24h),
        timestamp: Date.now(), // Bybit msg doesn't always have event time at root, use local
        exchange: 'Bybit'
    };
    this.tickerCallbacks.forEach(cb => cb(ticker));
  }

  private handleCandle(data: any) {
    // data is array of candles: { start, end, interval, open, close, high, low, volume, turnover, confirm }
    const k = data[0];
    const candle: Candle = {
        time: parseInt(k.start),
        open: parseFloat(k.open),
        high: parseFloat(k.high),
        low: parseFloat(k.low),
        close: parseFloat(k.close),
        volume: parseFloat(k.volume),
        isClosed: k.confirm // boolean
    };
    this.candleCallbacks.forEach(cb => cb(candle));
  }

  disconnect(): void {
    if (this.ws) {
        this.ws.close();
        this.ws = null;
    }
    if (this.pingInterval) clearInterval(this.pingInterval);
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
}