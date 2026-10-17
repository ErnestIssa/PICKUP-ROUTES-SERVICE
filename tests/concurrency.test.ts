import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "../src/concurrency";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("mapWithConcurrency", () => {
  it("never runs more than the limit at once", async () => {
    let running = 0;
    let peak = 0;
    await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async () => {
      running++;
      peak = Math.max(peak, running);
      await wait(5);
      running--;
    });
    expect(peak).toBe(2);
  });

  it("keeps results in the original order", async () => {
    const results = await mapWithConcurrency([30, 5, 15], 3, async (ms) => {
      await wait(ms);
      return ms;
    });
    expect(results).toEqual([30, 5, 15]);
  });

  it("stops starting new work after a failure", async () => {
    const started: number[] = [];
    await expect(
      mapWithConcurrency([1, 2, 3, 4, 5, 6], 1, async (n) => {
        started.push(n);
        if (n === 2) throw new Error("boom");
        return n;
      }),
    ).rejects.toThrow("boom");
    expect(started).toEqual([1, 2]);
  });

  it("handles an empty list", async () => {
    expect(await mapWithConcurrency([], 3, async (n) => n)).toEqual([]);
  });

  it("rejects a limit below 1", async () => {
    await expect(mapWithConcurrency([1], 0, async (n) => n)).rejects.toThrow(RangeError);
  });
});