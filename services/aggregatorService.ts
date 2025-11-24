import { Candle, ExchangeEvent, IExchangeAdapter, Ticker } from '../types';
import { BinanceService } from './binanceService';
import { OkxService } from './okxService';
import { BybitService } from './bybitService';

/**
 * Aggregator Service
 * 
 * Standardized interface to aggregate multiple exchanges.
 * Rules:
 * 1. Price Source: Binance (Primary Liquid Market) to ensure chart stability.
 * 2. Volume Source: Sum of Binance + OKX + Bybit.
 * 3. Trades: Emitted from all.
 */
export class AggregatorService implements IExchangeAdapter {
  name: string = "Polaris Aggregator (Binance + OKX + Bybit)";
  
  // Dynamic registry of adapters
  private adapters: IExchangeAdapter[] = [];
  
  private tickerCallbacks: ((ticker: Ticker) => void)[] = [];
  private candleCallbacks: ((candle: Candle) => void)[] = [];
  private jsonCallbacks: ((event: ExchangeEvent) => void)[] = [];

  // State for aggregation
  // store latest state from each exchange: key = exchangeName
  private latestCandles: Map<string, Candle> = new Map();
  private latestTickers: Map<string, Ticker> = new Map();

  constructor() {
    this.adapters = [
        new BinanceService(),
        new OkxService(),
        new BybitService()
    ];

    this.setupListeners();
  }

  private setupListeners() {
    this.adapters.forEach(adapter => {
        // Ticker Handling
        adapter.subscribeTicker(t => {
            this.latestTickers.set(adapter.name, t);
            this.emitAggregatedTicker();
        });

        // Candle Handling
        adapter.subscribeCandles(c => {
            this.handleCandleUpdate(adapter.name, c);
        });

        // Raw JSON Pass-through
        adapter.subscribeRawJson(e => this.emitJson(e));
    });
  }

  private emitAggregatedTicker() {
    // 1. Pick Price Anchor (Binance or first available)
    // We prefer "Binance" adapter if available for stability
    let anchorTicker = this.latestTickers.get("Binance (Real-Time)");
    if (!anchorTicker) {
        // Fallback to any first one
        anchorTicker = this.latestTickers.values().next().value;
    }

    if (!anchorTicker) return;

    // 2. Sum Volumes
    let totalVol = 0;
    this.latestTickers.forEach(t => {
        if (t.symbol === anchorTicker!.symbol) { // Basic safety check
            totalVol += t.volume24h;
        }
    });

    const aggTicker: Ticker = {
        ...anchorTicker,
        exchange: 'Aggregated',
        volume24h: totalVol,
        // We could also aggregate High/Low by taking Max/Min across exchanges
        // but typically high/low follows the price anchor for chart consistency.
    };

    this.tickerCallbacks.forEach(cb => cb(aggTicker));
  }

  private handleCandleUpdate(source: string, candle: Candle) {
    this.latestCandles.set(source, candle);

    // Logic: 
    // We drive the chart tick based on the Primary Price Anchor (Binance).
    // When Binance updates, we emit a candle with Binance's Price structure,
    // but we inject the SUM of volumes from other exchanges for that same timestamp.
    
    // If the update comes from secondary exchanges, we update our internal state,
    // but maybe we don't emit a new chart candle immediately to avoid jitter, 
    // UNLESS we want real-time volume updates. Let's emit on every primary update.
    
    const primarySource = "Binance (Real-Time)";
    
    // If we don't have primary yet, use whatever came in
    if (!this.latestCandles.has(primarySource) && source !== primarySource) {
        // Wait for primary or handle fallback logic? 
        // For smoother UX, let's just pass through if primary missing
        this.emitAggregatedCandle(candle, source); 
        return;
    }

    // Only emit when the primary source updates, or if we want high-freq volume updates,
    // we can emit on any update but force price to match primary.
    if (source === primarySource) {
        this.emitAggregatedCandle(candle, primarySource);
    } else {
        // Update from secondary (e.g. OKX volume changed)
        // We re-emit the Primary Candle with new Total Volume
        const primaryCandle = this.latestCandles.get(primarySource);
        if (primaryCandle) {
             // Check time alignment. Only aggregate volume for same candle time.
             if (candle.time === primaryCandle.time) {
                 this.emitAggregatedCandle(primaryCandle, primarySource);
             }
        }
    }
  }

  private emitAggregatedCandle(baseCandle: Candle, baseSource: string) {
      let totalVol = 0;
      
      this.latestCandles.forEach((c, src) => {
          // Only sum volume if timestamps match (within reasonable drift)
          if (Math.abs(c.time - baseCandle.time) < 1000) {
              totalVol += c.volume;
          }
      });

      const finalCandle: Candle = {
          ...baseCandle,
          volume: totalVol > 0 ? totalVol : baseCandle.volume
      };

      this.candleCallbacks.forEach(cb => cb(finalCandle));
  }

  async connect(symbol: string, interval: string): Promise<boolean> {
    this.emitJson({ type: 'status', data: { message: 'Initializing Aggregation...' }, source: 'Aggregator', timestamp: Date.now() });
    
    // Reset state
    this.latestCandles.clear();
    this.latestTickers.clear();

    try {
        await Promise.all(this.adapters.map(a => a.connect(symbol, interval)));
        return true;
    } catch (e) {
        console.error("Aggregation Connection Failed", e);
        return false;
    }
  }

  disconnect(): void {
    this.adapters.forEach(a => a.disconnect());
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
