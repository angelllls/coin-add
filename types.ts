
// 基础数据类型定义

export enum ChartInterval {
  _1m = '1m',
  _5m = '5m',
  _15m = '15m',
  _1h = '1h',
  _4h = '4h',
  _1d = '1d',
}

export interface Candle {
  time: number; // Timestamp ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isClosed?: boolean; // New: track if candle is finalized
  [key: string]: any; // Allow dynamic properties for indicators (e.g., candle.sma20)
}

export interface Ticker {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  high24h?: number;
  low24h?: number;
  timestamp: number;
  exchange: string;
}

export interface ExchangeEvent {
  type: 'ticker' | 'candle' | 'trade' | 'status' | 'depth';
  data: any;
  source: string; // e.g., 'Binance', 'OKX', 'BackendAggregator'
  timestamp: number;
}

// Indicator Types
export type IndicatorType = 'SMA' | 'EMA' | 'VWAP';

export interface IndicatorConfig {
  id: string;       // Unique ID, e.g., 'sma_7'
  name: string;     // Display name, e.g., 'MA 7'
  type: IndicatorType;
  period: number;
  color: string;
  lineWidth?: number;
}

// Chart Style Types
export type ChartStyle = 'candle_solid' | 'candle_hollow' | 'heikin_ashi' | 'line' | 'area';

// Drawing Types
export type DrawingToolType = 'cursor' | 'trendline' | 'fib' | 'text' | 'eraser';

export interface DrawingObject {
  id: string;
  type: DrawingToolType;
  points: { time: number; price: number }[]; // Storing data coordinates
  properties?: {
    color?: string;
    text?: string;
    lineWidth?: number;
  };
  state?: 'drawing' | 'finished'; // Track if we are currently placing points
}

// 规范化接口定义 - 适配器模式
export interface IExchangeAdapter {
  name: string;
  connect(symbol: string, interval: string): Promise<boolean>;
  disconnect(): void;
  subscribeTicker(callback: (ticker: Ticker) => void): void;
  subscribeCandles(callback: (candle: Candle) => void): void;
  subscribeRawJson(callback: (json: ExchangeEvent) => void): void; 
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model' | 'system';
  content: string;
  timestamp: number;
  isTyping?: boolean;
}

export interface ApiDocSection {
  title: string;
  content: string;
  code?: string;
}
