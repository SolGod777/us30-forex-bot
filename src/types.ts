export interface OandaRawCandle {
  complete: boolean;
  volume: number;
  time: string;
  mid: {
    o: string;
    h: string;
    l: string;
    c: string;
  };
}

export interface OandaCandleResponse {
  instrument: string;
  granularity: string;
  candles: OandaRawCandle[];
}

export interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
