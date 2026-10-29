
import { afterEach, describe, expect, it, vi } from "vitest";
import { history, quote, quotes } from "./brapi.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("brapi.dev quotes", () => {
  it("maps a Brazilian stock quote", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            requestedSymbol: "PETR4",
            symbol: "PETR4",
            data: {
              shortName: "PETR4",
              longName: "Petroleo Brasileiro SA Pfd",
              currency: "BRL",
              regularMarketPrice: 52.2,
              regularMarketChange: -0.31,
              regularMarketChangePercent: -0.59,
              regularMarketOpen: 52.05,
              regularMarketDayHigh: 53.03,
              regularMarketDayLow: 51.75,
              regularMarketPreviousClose: 52.51,
              regularMarketVolume: 51969000,
              marketCap: 718209391825,
              fiftyTwoWeekHigh: 59.79,
              fiftyTwoWeekLow: 29.53,
              regularMarketTime: "2026-10-29T21:30:30.000Z",
            },
          },
        ],
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await quote("PETR4");

    expect(result).toMatchObject({
      symbol: "PETR4",
      name: "Petroleo Brasileiro SA Pfd",
      price: 52.2,
      change: -0.31,
      changePercent: -0.59,
      currency: "BRL",
      exchange: "B3",
      source: "brapi",
      volume: 51969000,
      marketCap: 718209391825,
      week52High: 59.79,
      week52Low: 29.53,
    });

    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "symbols=PETR4",
    );
  });

  it("normalizes the Yahoo suffix .SA", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [
            {
              requestedSymbol: "PETR4",
              symbol: "PETR4",
              data: {
                regularMarketPrice: 52.2,
              },
            },
          ],
        }),
      }),
    );

    const result = await quote("PETR4.SA");

    expect(result.symbol).toBe("PETR4");
    expect(result.price).toBe(52.2);
  });

  it("throws when the requested symbol has no quote", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ results: [] }),
      }),
    );

    await expect(quote("BOVA11")).rejects.toThrow(
      "brapi: sem cotação para BOVA11",
    );
  });

  it("supports multiple symbols in one request", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            requestedSymbol: "PETR4",
            symbol: "PETR4",
            data: { regularMarketPrice: 52.2 },
          },
          {
            requestedSymbol: "BOVA11",
            symbol: "BOVA11",
            data: { regularMarketPrice: 145.5 },
          },
        ],
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await quotes(["PETR4", "BOVA11"]);

    expect(result).toHaveLength(2);
    expect(result.map((item) => item.symbol)).toEqual([
      "PETR4",
      "BOVA11",
    ]);
    expect(result.map((item) => item.price)).toEqual([52.2, 145.5]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws when the API responds with an HTTP error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      }),
    );

    await expect(quote("BOVA11")).rejects.toThrow("brapi HTTP 401");
  });
});

describe("brapi.dev history", () => {
  it("maps historical prices and adjusted close", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            symbol: "PETR4",
            historicalDataPrice: [
              {
                date: 1793278800,
                open: 50.1,
                high: 53.0,
                low: 49.8,
                close: 52.2,
                volume: 1000000,
                adjustedClose: 48.7,
              },
            ],
          },
        ],
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const candles = await history("PETR4", "3mo", "1d");

    expect(candles).toHaveLength(1);
    expect(candles[0]).toMatchObject({
      time: 1793278800,
      open: 50.1,
      high: 53.0,
      low: 49.8,
      close: 52.2,
      volume: 1000000,
      adjClose: 48.7,
    });

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("symbols=PETR4");
    expect(url).toContain("range=3mo");
    expect(url).toContain("interval=1d");
  });

  it("normalizes .SA and throws when history is unavailable", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ symbol: "PETR4", historicalDataPrice: [] }],
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(history("PETR4.SA", "3mo", "1d")).rejects.toThrow(
      "brapi: histórico indisponível para PETR4",
    );

    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "symbols=PETR4",
    );
  });
});
