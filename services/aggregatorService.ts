import { Candle, ExchangeEvent, IExchangeAdapter, Ticker } from '../types';
import { BinanceService } from './binanceService';
import { OkxService } from './okxService';

/**
 * Aggregator Service
 * 
 * Responsibilities:
 * 1. Connects to multiple exchanges (Binance, OKX).
 * 2. Normalizes data formats.
 * 3. Aggregates Orderflow/Volume (Sum of all exchanges).
 * 4. Determines Price (Uses Binance as 'Lead' exchange for chart shape consistency).
 */
export class AggregatorService implements IExchangeAdapter {
  name: string = "Polaris Aggregator (Binance + OKX)";
  
  private binance: BinanceService;
  private okx: OkxService;
  
  private tickerCallbacks: ((ticker: Ticker) => void)[] = [];
  private candleCallbacks: ((candle: Candle) => void)[] = [];
  private jsonCallbacks: ((event: ExchangeEvent) => void)[] = [];

  // State for aggregation
  private latestBinanceCandle: Candle | null = null;
  private latestOkxCandle: Candle | null = null;
  private lastEmitTime: number = 0;

  constructor() {
    this.binance = new BinanceService();
    this.okx = new OkxService();

    this.setupListeners();
  }

  private setupListeners() {
    // 1. Ticker Aggregation
    // We use Binance price for display, but sum volumes for 24h stats
    let binanceTicker: Ticker | null = null;
    let okxTicker: Ticker | null = null;

    const emitAggregatedTicker = () => {
        if (!binanceTicker) return;
        
        const aggTicker: Ticker = {
            ...binanceTicker,
            exchange: 'Aggregated (Binance+OKX)',
            volume24h: (binanceTicker.volume24h || 0) + (okxTicker?.volume24h || 0),
        };
        this.tickerCallbacks.forEach(cb => cb(aggTicker));
    };

    this.binance.subscribeTicker(t => { binanceTicker = t; emitAggregatedTicker(); });
    this.okx.subscribeTicker(t => { okxTicker = t; emitAggregatedTicker(); });

    // 2. Candle Aggregation
    this.binance.subscribeCandles(c => this.handleCandleUpdate('binance', c));
    this.okx.subscribeCandles(c => this.handleCandleUpdate('okx', c));

    // 3. Raw JSON pass-through
    this.binance.subscribeRawJson(e => this.emitJson(e));
    this.okx.subscribeRawJson(e => this.emitJson(e));
  }

  private handleCandleUpdate(source: 'binance' | 'okx', candle: Candle) {
    if (source === 'binance') this.latestBinanceCandle = candle;
    if (source === 'okx') this.latestOkxCandle = candle;

    // Logic: 
    // We align based on timestamp. 
    // Price = Binance (Lead)
    // Volume = Binance + OKX (if timestamps match)
    
    if (!this.latestBinanceCandle) return;

    const base = this.latestBinanceCandle;
    let addedVolume = 0;

    if (this.latestOkxCandle && this.latestOkxCandle.time === base.time) {
        addedVolume = this.latestOkxCandle.volume;
    }

    const aggCandle: Candle = {
        ...base,
        volume: base.volume + addedVolume,
        // Optional: you can add custom properties to visualize the split if the chart supported it
        // binanceVol: base.volume,
        // okxVol: addedVolume
    };

    this.candleCallbacks.forEach(cb => cb(aggCandle));
  }

  async connect(symbol: string, interval: string): Promise<boolean> {
    this.emitJson({ type: 'status', data: { message: 'Initializing Aggregation...' }, source: 'Aggregator', timestamp: Date.now() });
    
    // Reset state
    this.latestBinanceCandle = null;
    this.latestOkxCandle = null;

    try {
        await Promise.all([
            this.binance.connect(symbol, interval),
            this.okx.connect(symbol, interval)
        ]);
        return true;
    } catch (e) {
        console.error("Aggregation Connection Failed", e);
        return false;
    }
  }

  disconnect(): void {
    this.binance.disconnect();
    this.okx.disconnect();
    this.emitJson({ type: 'status', data: { message: 'Aggregator Disconnected' }, source: 'Aggregator', timestamp: Date.now() });
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

export const aggregatorService = new AggregatorService();