
import type { Candle, Quote } from "./yahoo.js";

const BASE_URL = "https://brapi.dev/api/v2/stocks";

type BrapiQuoteData = {
  symbol?: string;
  shortName?: string;
  longName?: string;
  currency?: string;
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  regularMarketOpen?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketPreviousClose?: number;
  regularMarketVolume?: number;
  marketCap?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  regularMarketTime?: string;
};

type BrapiQuoteResult = {
  symbol?: string;
  requestedSymbol?: string;
  data?: BrapiQuoteData;
};

type BrapiHistoryItem = {
  date?: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  adjustedClose?: number;
};

type BrapiHistoryResult = {
  symbol?: string;
  historicalDataPrice?: BrapiHistoryItem[];
};

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/\.SA$/, "");
}

function buildUrl(
  endpoint: string,
  params: Record<string, string>,
): string {
  const url = new URL(`${BASE_URL}/${endpoint}`);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const token = process.env.BRAPI_TOKEN?.trim();

  if (token) {
    url.searchParams.set("token", token);
  }

  return url.toString();
}

async function request<T>(url: string): Promise<T> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`brapi HTTP ${response.status}`);
  }

  return (await response.json()) as T;
}

function toNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function toQuote(symbol: string, data: BrapiQuoteData): Quote {
  const price = toNumber(data.regularMarketPrice);

  if (price === undefined) {
    throw new Error(`brapi: preço indisponível para ${symbol}`);
  }

  const marketTime = data.regularMarketTime
    ? Math.floor(new Date(data.regularMarketTime).getTime() / 1000)
    : undefined;

  return {
    symbol,
    name: data.longName ?? data.shortName ?? symbol,
    price,
    change: toNumber(data.regularMarketChange) ?? 0,
    changePercent: toNumber(data.regularMarketChangePercent) ?? 0,
    open: toNumber(data.regularMarketOpen) ?? null,
    high: toNumber(data.regularMarketDayHigh) ?? null,
    low: toNumber(data.regularMarketDayLow) ?? null,
    previousClose: toNumber(data.regularMarketPreviousClose) ?? null,
    bid: null,
    ask: null,
    volume: toNumber(data.regularMarketVolume) ?? null,
    avgVolume: null,
    marketCap: toNumber(data.marketCap) ?? null,
    pe: null,
    eps: null,
    dividendYield: null,
    week52High: toNumber(data.fiftyTwoWeekHigh) ?? null,
    week52Low: toNumber(data.fiftyTwoWeekLow) ?? null,
    beta: null,
    sharesOutstanding: null,
    currency: data.currency ?? "BRL",
    exchange: "B3",
    marketState: null,
    time:
      marketTime !== undefined && Number.isFinite(marketTime)
        ? marketTime
        : null,
    source: "brapi",
  } as Quote;
}

export async function quotes(symbols: string[]): Promise<Quote[]> {
  const normalized = [...new Set(symbols.map(normalizeSymbol))].filter(Boolean);

  if (normalized.length === 0) {
    return [];
  }

  const url = buildUrl("quote", {
    symbols: normalized.join(","),
  });

  const json = await request<{ results?: BrapiQuoteResult[] }>(url);
  const results = json.results ?? [];

  return normalized.map((symbol) => {
    const result = results.find(
      (item) =>
        normalizeSymbol(item.requestedSymbol ?? item.symbol ?? "") === symbol,
    );

    if (!result?.data) {
      throw new Error(`brapi: sem cotação para ${symbol}`);
    }

    return toQuote(symbol, result.data);
  });
}

export async function quote(symbol: string): Promise<Quote> {
  const [result] = await quotes([symbol]);

  if (!result) {
    throw new Error(`brapi: sem cotação para ${symbol}`);
  }

  return result;
}

export async function history(
  symbol: string,
  range = "1y",
  interval = "1d",
): Promise<Candle[]> {
  const normalized = normalizeSymbol(symbol);

  const url = buildUrl("historical", {
    symbols: normalized,
    range,
    interval,
  });

  const json = await request<{ results?: BrapiHistoryResult[] }>(url);
  const result = json.results?.find(
    (item) => normalizeSymbol(item.symbol ?? "") === normalized,
  ) ?? json.results?.[0];

  const historyItems = result?.historicalDataPrice;

  if (!historyItems?.length) {
    throw new Error(`brapi: histórico indisponível para ${normalized}`);
  }

  return historyItems
    .filter(
      (item) =>
        typeof item.date === "number" &&
        toNumber(item.close) !== undefined,
    )
    .map((item) => ({
      time: item.date!,
      open: toNumber(item.open) ?? toNumber(item.close)!,
      high: toNumber(item.high) ?? toNumber(item.close)!,
      low: toNumber(item.low) ?? toNumber(item.close)!,
      close: toNumber(item.close)!,
      volume: toNumber(item.volume) ?? 0,
      adjClose: toNumber(item.adjustedClose),
    }));
}
