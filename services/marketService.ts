interface MarketPair {
  symbol: string; // BTC/USDT
  base: string;
  quote: string;
  exchange: string;
  volume: string;
}

const STORAGE_KEY = 'polaris_market_pairs';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

export class MarketService {
  
  async getAvailablePairs(): Promise<MarketPair[]> {
    // 1. Try Local Storage
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.timestamp < CACHE_DURATION) {
            console.log("[MarketService] Loaded pairs from cache");
            return parsed.data;
        }
      } catch (e) {
        console.warn("Invalid cache");
      }
    }

    // 2. Fetch Fresh (Simulated mainly due to CORS, but structured for real impl)
    console.log("[MarketService] Fetching fresh pairs...");
    const pairs = await this.fetchAllPairs();
    
    // 3. Save
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      timestamp: Date.now(),
      data: pairs
    }));

    return pairs;
  }

  private async fetchAllPairs(): Promise<MarketPair[]> {
    // In a real browser app without backend proxy, calling Exchange APIs directly usually fails due to CORS.
    // We will simulate the "Network Request" delay and return a comprehensive list that *would* come from them.
    
    // However, if we were to implement it:
    // await fetch('https://api.binance.com/api/v3/exchangeInfo');
    // await fetch('https://www.okx.com/api/v5/public/instruments?instType=SWAP');
    
    await new Promise(r => setTimeout(r, 800)); // Simulate latency

    // Initial Seed Data representing "Retrieved" data
    const assets = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'AVAX', 'TRX', 'DOT', 'MATIC', 'LTC', 'UNI', 'LINK', 'PEPE', 'WIF', 'BONK', 'ORDI', 'SUI', 'APT'];
    const quotes = ['USDT', 'USDC'];
    
    const pairs: MarketPair[] = [];

    assets.forEach(base => {
        quotes.forEach(quote => {
            const symbol = `${base}/${quote}`;
            
            // Binance
            pairs.push({
                symbol,
                base,
                quote,
                exchange: 'Binance',
                volume: (Math.random() * 1000 + 50).toFixed(1) + 'M'
            });

            // OKX
            pairs.push({
                symbol,
                base,
                quote,
                exchange: 'OKX',
                volume: (Math.random() * 800 + 30).toFixed(1) + 'M'
            });

            // Bybit
            pairs.push({
                symbol,
                base,
                quote,
                exchange: 'Bybit',
                volume: (Math.random() * 600 + 20).toFixed(1) + 'M'
            });
        });
    });

    return pairs.sort((a,b) => parseFloat(b.volume) - parseFloat(a.volume));
  }
}

export const marketService = new MarketService();
