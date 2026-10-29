
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const {
  yahooHistory,
  yahooQuotes,
  yahooQuoteFromChart,
  nasdaqHistory,
  nasdaqQuote,
  stooqHistory,
  stooqQuote,
  binanceHistory,
  binanceQuote,
  brapiHistory,
  brapiQuotes,
} = vi.hoisted(() => ({
  yahooHistory: vi.fn(),
  yahooQuotes: vi.fn(),
  yahooQuoteFromChart: vi.fn(),
  nasdaqHistory: vi.fn(),
  nasdaqQuote: vi.fn(),
  stooqHistory: vi.fn(),
  stooqQuote: vi.fn(),
  binanceHistory: vi.fn(),
  binanceQuote: vi.fn(),
  brapiHistory: vi.fn(),
  brapiQuotes: vi.fn(),
}));

vi.mock("../providers/yahoo.js", () => ({
  history: yahooHistory,
  quotes: yahooQuotes,
  quoteFromChart: yahooQuoteFromChart,
}));

vi.mock("../providers/brapi.js", () => ({
  history: brapiHistory,
  quote: vi.fn(),
  quotes: brapiQuotes,
}));

vi.mock("../providers/nasdaq.js", () => ({
  history: nasdaqHistory,
  quote: nasdaqQuote,
}));

vi.mock("../providers/stooq.js", () => ({
  history: stooqHistory,
  quote: stooqQuote,
}));

vi.mock("../providers/binance.js", () => ({
  CRYPTO_SYMBOLS: new Set(["BTCUSDT"]),
  history: binanceHistory,
  quote: binanceQuote,
}));

import { marketRouter } from "./market.js";

function fakeRes(): Response {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
}

function getHandler(path: string) {
  const layer = (marketRouter as any).stack.find(
    (l: any) => l.route?.path === path,
  );

  if (!layer) throw new Error(`no route registered for ${path}`);

  return layer.route.stack[0].handle as (
    req: Request,
    res: Response,
    next: () => void,
  ) => unknown;
}

function fakeHistoryRequest(symbol: string, range = "1Y") {
  return {
    params: { symbol },
    query: { range },
    path: `/history/${symbol}`,
  } as unknown as Request;
}

function fakeQuotesRequest(symbols: string) {
  return {
    query: { symbols },
    path: "/quotes",
  } as unknown as Request;
}

function fakeQuote(symbol: string) {
  return {
    symbol,
    name: `${symbol} test`,
    price: 100,
    change: 1,
    changePercent: 1,
    open: 99,
    high: 101,
    low: 98,
    previousClose: 99,
    bid: null,
    ask: null,
    volume: 1000,
    avgVolume: 1000,
    marketCap: null,
    pe: null,
    eps: null,
    dividendYield: null,
    week52High: null,
    week52Low: null,
    beta: null,
    sharesOutstanding: null,
    currency: "BRL",
    exchange: "SAO",
    marketState: "REGULAR",
    time: 1793278800,
    source: "yahoo",
  };
}

const candles = [
  {
    time: 1793278800,
    open: 52,
    high: 53,
    low: 51,
    close: 52.35,
    adjClose: 51.9,
    volume: 1000,
  },
];

describe("GET /crypto/orderbook/:symbol", () => {
  it("rejects unsupported symbols before touching the network", async () => {
    const handler = getHandler("/crypto/orderbook/:symbol");
    const req = {
      params: { symbol: "AAA&limit=5000" },
    } as unknown as Request;
    const res = fakeRes();

    await handler(req, res, () => {});

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: "unsupported crypto symbol",
    });
  });
});

describe("GET /history/:symbol", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    brapiHistory.mockResolvedValue(candles);
    yahooHistory.mockResolvedValue(candles);
    nasdaqHistory.mockResolvedValue(candles);
    stooqHistory.mockResolvedValue(candles);
    binanceHistory.mockResolvedValue(candles);
  });

  it("uses brapi first for Brazilian .SA symbols", async () => {
    const handler = getHandler("/history/:symbol");
    const req = fakeHistoryRequest("PETR4.SA");
    const res = fakeRes();

    await handler(req, res, () => {});

    expect(brapiHistory).toHaveBeenCalledWith("PETR4.SA", "1y", "1d");
    expect(yahooHistory).not.toHaveBeenCalled();
    expect(nasdaqHistory).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(candles);
  });

  it("preserves raw close and adjusted close as separate fields", async () => {
    const handler = getHandler("/history/:symbol");
    const req = fakeHistoryRequest("TESTE-ADJ-2.SA");
    const res = fakeRes();

    await handler(req, res, () => {});

    const response = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];

    expect(response[0].close).toBe(52.35);
    expect(response[0].adjClose).toBe(51.9);
  });

  it("normalizes a Brazilian ticker and uses brapi for history", async () => {
    const handler = getHandler("/history/:symbol");
    const req = fakeHistoryRequest("PETR4");
    const res = fakeRes();

    await handler(req, res, () => {});

    expect(brapiHistory).toHaveBeenCalledWith("PETR4", "1y", "1d");
    expect(yahooHistory).not.toHaveBeenCalled();
    expect(nasdaqHistory).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(candles);
  });

  it("falls back to Yahoo when brapi history fails", async () => {
    brapiHistory.mockRejectedValueOnce(new Error("brapi unavailable"));

    const handler = getHandler("/history/:symbol");
    const req = fakeHistoryRequest("PETR4", "5Y");
    const res = fakeRes();

    await handler(req, res, () => {});

    expect(brapiHistory).toHaveBeenCalledWith("PETR4", "5y", "1wk");
expect(yahooHistory).toHaveBeenCalledWith("PETR4.SA", "5y", "1wk");
expect(res.json).toHaveBeenCalledWith(candles);
  });

  it("keeps the existing fallback chain for non-Brazilian symbols", async () => {
    const handler = getHandler("/history/:symbol");
    const req = fakeHistoryRequest("TEST-US-3");
    const res = fakeRes();

    await handler(req, res, () => {});

    expect(nasdaqHistory).toHaveBeenCalledWith("TEST-US-3", "1Y");
    expect(yahooHistory).not.toHaveBeenCalled();
    expect(brapiHistory).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(candles);
  });
});

describe("GET /quotes", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    brapiQuotes.mockResolvedValue([]);
    yahooQuotes.mockResolvedValue([]);
    yahooQuoteFromChart.mockRejectedValue(new Error("not mocked"));
    nasdaqQuote.mockRejectedValue(new Error("not mocked"));
    stooqQuote.mockRejectedValue(new Error("not mocked"));
    binanceQuote.mockRejectedValue(new Error("not mocked"));
  });

  it("routes PETR4 through brapi and preserves the original symbol", async () => {
    const handler = getHandler("/quotes");
    brapiQuotes.mockResolvedValue([fakeQuote("PETR4")]);

    const req = fakeQuotesRequest("PETR4");
    const res = fakeRes();

    await handler(req, res, () => {});

    expect(brapiQuotes).toHaveBeenCalledWith(["PETR4.SA"]);
    expect(yahooQuotes).not.toHaveBeenCalled();
    expect(nasdaqQuote).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith([
      expect.objectContaining({ symbol: "PETR4", price: 100 }),
    ]);
  });

  it("falls back to Yahoo for BOVA11 when brapi fails", async () => {
    brapiQuotes.mockRejectedValueOnce(new Error("brapi HTTP 401"));
    yahooQuotes.mockResolvedValue([fakeQuote("BOVA11.SA")]);

    const handler = getHandler("/quotes");
    const req = fakeQuotesRequest("BOVA11");
    const res = fakeRes();

    await handler(req, res, () => {});

    expect(brapiQuotes).toHaveBeenCalledWith(["BOVA11.SA"]);
    expect(yahooQuotes).toHaveBeenCalledWith(["BOVA11.SA"]);
    expect(nasdaqQuote).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith([
      expect.objectContaining({ symbol: "BOVA11", price: 100 }),
    ]);
  });

  it("preserves the existing Nasdaq path for AAPL", async () => {
    const handler = getHandler("/quotes");
    nasdaqQuote.mockResolvedValue(fakeQuote("AAPL"));

    const req = fakeQuotesRequest("AAPL");
    const res = fakeRes();

    await handler(req, res, () => {});

    expect(nasdaqQuote).toHaveBeenCalledWith("AAPL");
    expect(brapiQuotes).not.toHaveBeenCalled();
    expect(yahooQuotes).not.toHaveBeenCalledWith(["AAPL.SA"]);
    expect(res.json).toHaveBeenCalledWith([
      expect.objectContaining({ symbol: "AAPL", price: 100 }),
    ]);
  });
});
