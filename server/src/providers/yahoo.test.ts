import { afterEach, describe, expect, it, vi } from "vitest";
import { history } from "./yahoo.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Yahoo Finance history", () => {
  it("preserves raw OHLC and exposes adjusted close when available", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        chart: {
          result: [
            {
              timestamp: [1793278800],
              indicators: {
                quote: [
                  {
                    open: [30.1],
                    high: [31.0],
                    low: [29.8],
                    close: [30.02],
                    volume: [1000000],
                  },
                ],
                adjclose: [{ adjclose: [27.3625] }],
              },
            },
          ],
          error: null,
        },
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const candles = await history("PETR4.SA", "1y", "1d");

    expect(candles).toHaveLength(1);
    expect(candles[0]).toMatchObject({
      open: 30.1,
      high: 31.0,
      low: 29.8,
      close: 30.02,
      adjClose: 27.3625,
      volume: 1000000,
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain("PETR4.SA");
  });

  it("keeps the candle valid when adjusted close is absent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          chart: {
            result: [
              {
                timestamp: [1793278800],
                indicators: {
                  quote: [
                    {
                      open: [10],
                      high: [11],
                      low: [9],
                      close: [10.5],
                      volume: [500],
                    },
                  ],
                },
              },
            ],
            error: null,
          },
        }),
      })
    );

    const candles = await history("PETR4.SA", "1y", "1d");

    expect(candles).toHaveLength(1);
    expect(candles[0].close).toBe(10.5);
    expect(candles[0].adjClose).toBeUndefined();
  });
});
