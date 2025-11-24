import { Candle, ExchangeEvent, IExchangeAdapter, Ticker } from '../types';

export class OkxService implements IExchangeAdapter {
  name: string = "OKX (Real-Time)";
  private ws: WebSocket | null = null;
  private currentSymbol: string = "";
  private currentInterval: string = "";
  private pingInterval: any = null;

  private tickerCallbacks: ((ticker: Ticker) => void)[] = [];
  private candleCallbacks: ((candle: Candle) => void)[] = [];
  private jsonCallbacks: ((event: ExchangeEvent) => void)[] = [];

  // OKX uses "BTC-USDT"
  private normalizeSymbol(symbol: string): string {
    return symbol.replace('/', '-').toUpperCase();
  }

  // OKX uses "1m", "1H", "4H", "1D" (Capital H/D)
  private normalizeInterval(interval: string): string {
    if (interval.endsWith('h')) return interval.toUpperCase();
    if (interval.endsWith('d')) return interval.toUpperCase();
    return interval;
  }

  async connect(symbol: string, interval: string): Promise<boolean> {
    this.disconnect();
    
    this.currentSymbol = symbol;
    this.currentInterval = interval;
    const okxSymbol = this.normalizeSymbol(symbol);
    const okxInterval = this.normalizeInterval(interval);

    this.emitJson({ type: 'status', data: { status: 'connecting', symbol: okxSymbol }, source: 'System', timestamp: Date.now() });

    // Note: OKX REST API often has strict CORS. We will skip historical fetch in this frontend-only demo 
    // and rely on real-time stream accumulation or let the Aggregator handle history via Binance.
    // In a Node.js backend, we would fetch https://www.okx.com/api/v5/market/candles here.

    const wsUrl = `wss://ws.okx.com:8443/ws/v5/public`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log(`[OKX] Connected`);
      this.emitJson({ type: 'status', data: { status: 'connected_ws' }, source: 'OKX WS', timestamp: Date.now() });
      
      // Subscribe Ticker
      const tickerSub = {
        op: "subscribe",
        args: [{ channel: "tickers", instId: okxSymbol }]
      };
      this.ws?.send(JSON.stringify(tickerSub));

      // Subscribe Candle
      const candleSub = {
        op: "subscribe",
        args: [{ channel: `candle${okxInterval}`, instId: okxSymbol }]
      };
      this.ws?.send(JSON.stringify(candleSub));

      // Heartbeat every 20s
      this.pingInterval = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send("ping");
        }
      }, 20000);
    };

    this.ws.onmessage = (event) => {
      try {
        if (event.data === "pong") return;
        
        const msg = JSON.parse(event.data);
        
        if (msg.event === 'subscribe') return; // Ack

        if (msg.arg && msg.data) {
          const channel = msg.arg.channel;
          const data = msg.data[0];

          if (channel === 'tickers') {
             this.handleTicker(data);
          } else if (channel.startsWith('candle')) {
             this.handleCandle(data);
          }

          // Debug Stream
          // We limit emission to avoid spamming the monitor in aggregation mode
          if (Math.random() > 0.8) {
            this.emitJson({ 
                type: channel.startsWith('candle') ? 'candle' : 'ticker', 
                data: data, 
                source: 'OKX', 
                timestamp: Date.now() 
            });
          }
        }
      } catch (e) {
        // console.error("OKX Parse Error", e);
      }
    };

    this.ws.onclose = () => {
        this.emitJson({ type: 'status', data: { status: 'disconnected' }, source: 'OKX System', timestamp: Date.now() });
    };

    return true;
  }

  private handleTicker(data: any) {
    // OKX Ticker: { instId, last, open24h, high24h, low24h, vol24h, ... }
    const ticker: Ticker = {
        symbol: this.currentSymbol,
        price: parseFloat(data.last),
        change24h: ((parseFloat(data.last) - parseFloat(data.open24h)) / parseFloat(data.open24h)) * 100,
        volume24h: parseFloat(data.vol24h), // Trading volume in base currency
        high24h: parseFloat(data.high24h),
        low24h: parseFloat(data.low24h),
        timestamp: parseInt(data.ts),
        exchange: 'OKX'
    };
    this.tickerCallbacks.forEach(cb => cb(ticker));
  }

  private handleCandle(data: any) {
    // OKX Candle: [ts, o, h, l, c, vol, volCcy, volCcyQuote, confirm]
    // confirm: "0" or "1" (1 means closed)
    const candle: Candle = {
        time: parseInt(data[0]),
        open: parseFloat(data[1]),
        high: parseFloat(data[2]),
        low: parseFloat(data[3]),
        close: parseFloat(data[4]),
        volume: parseFloat(data[5]), // Base Volume
        isClosed: data[8] === "1"
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