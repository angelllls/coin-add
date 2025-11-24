import { Candle, ExchangeEvent, IExchangeAdapter, Ticker } from '../types';

/**
 * Binance Exchange Adapter
 * Implements standard IExchangeAdapter to provide REAL market data.
 * 
 * Connecting to:
 * 1. REST API (https://data-api.binance.vision) for historical K-lines (Snapshot)
 * 2. WebSocket (wss://stream.binance.com:9443) for real-time updates
 */
export class BinanceService implements IExchangeAdapter {
  name: string = "Binance (Real-Time)";
  private ws: WebSocket | null = null;
  private currentSymbol: string = "";
  private currentInterval: string = "";
  private pingInterval: any = null;

  // Event Emitters
  private tickerCallbacks: ((ticker: Ticker) => void)[] = [];
  private candleCallbacks: ((candle: Candle) => void)[] = [];
  private jsonCallbacks: ((event: ExchangeEvent) => void)[] = [];

  // Helper to convert internal symbol format "BTC/USDT" -> "btcusdt"
  private normalizeSymbol(symbol: string): string {
    return symbol.replace('/', '').toLowerCase();
  }

  // Convert "1m", "1h" to Binance interval if different (Binance uses standard 1m, 1h, 1d)
  private normalizeInterval(interval: string): string {
    return interval;
  }

  async connect(symbol: string, interval: string): Promise<boolean> {
    this.disconnect();
    
    this.currentSymbol = symbol;
    this.currentInterval = interval;
    const binanceSymbol = this.normalizeSymbol(symbol);
    const binanceInterval = this.normalizeInterval(interval);

    this.emitJson({ type: 'status', data: { status: 'connecting', symbol: binanceSymbol }, source: 'System', timestamp: Date.now() });

    try {
        // 1. Fetch History (Snapshot)
        // Using data-api.binance.vision which is more CORS friendly than api.binance.com
        const historyUrl = `https://data-api.binance.vision/api/v3/klines?symbol=${binanceSymbol.toUpperCase()}&interval=${binanceInterval}&limit=100`;
        const response = await fetch(historyUrl);
        if (response.ok) {
            const data = await response.json();
            data.forEach((k: any) => {
                const candle: Candle = {
                    time: k[0],
                    open: parseFloat(k[1]),
                    high: parseFloat(k[2]),
                    low: parseFloat(k[3]),
                    close: parseFloat(k[4]),
                    volume: parseFloat(k[5]),
                    isClosed: true
                };
                this.candleCallbacks.forEach(cb => cb(candle));
            });
            this.emitJson({ type: 'status', data: { message: `Loaded ${data.length} historical candles` }, source: 'Binance REST', timestamp: Date.now() });
        } else {
             this.emitJson({ type: 'status', data: { error: 'Failed to fetch history (CORS or Rate Limit)' }, source: 'Binance REST', timestamp: Date.now() });
        }
    } catch (e) {
        console.error("History Fetch Error", e);
        this.emitJson({ type: 'status', data: { error: 'History fetch network error' }, source: 'Binance REST', timestamp: Date.now() });
    }

    // 2. Connect WebSocket
    // Subscribe to Aggregated Trade? No, Ticker + Kline is enough for this view.
    // Stream: <symbol>@kline_<interval> / <symbol>@miniTicker
    const wsUrl = `wss://stream.binance.com:9443/stream?streams=${binanceSymbol}@kline_${binanceInterval}/${binanceSymbol}@miniTicker`;
    
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log(`[Binance] Connected to ${symbol}`);
      this.emitJson({ type: 'status', data: { status: 'connected_ws' }, source: 'Binance WS', timestamp: Date.now() });
      
      // Setup Heartbeat (Binance usually sends pings, but we can send pong or keep alive if needed, 
      // though browser WS handles low level ping/pong frames automatically)
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const stream = msg.stream;
        const payload = msg.data;

        // Route based on stream type
        if (stream.includes('@miniTicker')) {
            this.handleTicker(payload);
        } else if (stream.includes('@kline')) {
            this.handleKline(payload);
        }

        // Raw Debug Stream (Throttled slightly in real app, but here raw)
        // We only emit 'ticker' type events occasionally or full stream? 
        // Let's emit all for the "Monitor" tab.
        this.emitJson({ 
            type: stream.includes('kline') ? 'candle' : 'ticker', 
            data: payload, 
            source: 'Binance', 
            timestamp: Date.now() 
        });

      } catch (e) {
        console.error("Parse Error", e);
      }
    };

    this.ws.onclose = () => {
        this.emitJson({ type: 'status', data: { status: 'disconnected' }, source: 'System', timestamp: Date.now() });
    };

    this.ws.onerror = (err) => {
        this.emitJson({ type: 'status', data: { error: 'WebSocket Error' }, source: 'System', timestamp: Date.now() });
    };

    return true;
  }

  private handleTicker(data: any) {
    // MiniTicker payload:
    // { e: '24hrMiniTicker', E: 123456789, s: 'BTCUSDT', c: '60000.00', o: '59000.00', h: '...', l: '...', v: '...', q: '...' }
    const ticker: Ticker = {
        symbol: this.currentSymbol,
        price: parseFloat(data.c),
        change24h: ((parseFloat(data.c) - parseFloat(data.o)) / parseFloat(data.o)) * 100, // Approximate change calc
        volume24h: parseFloat(data.v), // Base asset volume
        high24h: parseFloat(data.h),
        low24h: parseFloat(data.l),
        timestamp: data.E,
        exchange: 'Binance'
    };
    this.tickerCallbacks.forEach(cb => cb(ticker));
  }

  private handleKline(data: any) {
    // Kline payload: { e: 'kline', E: 123456789, s: 'BTCUSDT', k: { t: 123400000, T: 123460000, s: 'BTCUSDT', i: '1m', f: 100, L: 200, o: '...', c: '...', h: '...', l: '...', v: '...', ... x: false } }
    const k = data.k;
    const candle: Candle = {
        time: k.t,
        open: parseFloat(k.o),
        high: parseFloat(k.h),
        low: parseFloat(k.l),
        close: parseFloat(k.c),
        volume: parseFloat(k.v),
        isClosed: k.x // x is "is candle closed"
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

export const binanceService = new BinanceService();