import { Candle, IndicatorConfig } from '../types';

/**
 * Calculates Simple Moving Average (SMA)
 */
const calculateSMA = (data: Candle[], period: number, key: string): Candle[] => {
  return data.map((item, index, array) => {
    if (index < period - 1) {
      return { ...item, [key]: null }; // Not enough data
    }

    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += array[index - i].close;
    }
    const avg = sum / period;
    return { ...item, [key]: avg };
  });
};

/**
 * Calculates Exponential Moving Average (EMA)
 */
const calculateEMA = (data: Candle[], period: number, key: string): Candle[] => {
  const k = 2 / (period + 1);
  let previousEma: number | null = null;

  return data.map((item, index) => {
    // For the very first point available (or simple approximation), start with close or SMA
    // Here we use a simple rolling calc.
    if (index === 0) {
      previousEma = item.close;
      return { ...item, [key]: item.close };
    }

    const currentEma = (item.close * k) + (previousEma! * (1 - k));
    previousEma = currentEma;
    return { ...item, [key]: currentEma };
  });
};

/**
 * Calculates Volume Weighted Average Price (VWAP)
 */
const calculateVWAP = (data: Candle[], period: number, key: string): Candle[] => {
  return data.map((item, index, array) => {
    if (index < period - 1) {
       return { ...item, [key]: null };
    }

    let sumPV = 0; // Price * Volume
    let sumV = 0;  // Volume

    for (let i = 0; i < period; i++) {
      const candle = array[index - i];
      const typicalPrice = (candle.high + candle.low + candle.close) / 3;
      sumPV += typicalPrice * candle.volume;
      sumV += candle.volume;
    }

    const vwap = sumV === 0 ? 0 : sumPV / sumV;
    return { ...item, [key]: vwap };
  });
};

/**
 * Converts standard candles to Heikin Ashi candles
 * Formula:
 * HA_Close = (Open + High + Low + Close) / 4
 * HA_Open = (Prev_HA_Open + Prev_HA_Close) / 2
 * HA_High = Max(High, HA_Open, HA_Close)
 * HA_Low = Min(Low, HA_Open, HA_Close)
 */
export const calculateHeikinAshi = (data: Candle[]): Candle[] => {
  if (data.length === 0) return [];

  const result: Candle[] = [];
  
  // First candle logic
  const first = data[0];
  let prevHaOpen = first.open;
  let prevHaClose = first.close;
  
  result.push({
      ...first,
      open: prevHaOpen,
      close: prevHaClose,
      high: first.high,
      low: first.low
  });

  for (let i = 1; i < data.length; i++) {
      const curr = data[i];
      const haClose = (curr.open + curr.high + curr.low + curr.close) / 4;
      const haOpen = (prevHaOpen + prevHaClose) / 2;
      const haHigh = Math.max(curr.high, haOpen, haClose);
      const haLow = Math.min(curr.low, haOpen, haClose);

      result.push({
          ...curr,
          open: haOpen,
          close: haClose,
          high: haHigh,
          low: haLow
      });

      prevHaOpen = haOpen;
      prevHaClose = haClose;
  }
  
  return result;
};

/**
 * Main function to apply a list of indicators to the candle data
 */
export const applyIndicators = (data: Candle[], indicators: IndicatorConfig[]): Candle[] => {
  if (!data || data.length === 0) return [];
  
  let result = [...data];

  indicators.forEach(ind => {
    const key = ind.id; // The property name to inject into the candle object
    
    if (ind.type === 'SMA') {
      result = calculateSMA(result, ind.period, key);
    } else if (ind.type === 'EMA') {
      result = calculateEMA(result, ind.period, key);
    } else if (ind.type === 'VWAP') {
      result = calculateVWAP(result, ind.period, key);
    }
  });

  return result;
};