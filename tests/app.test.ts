import type { AddressInfo } from "node:net";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import { silentLogger } from "../src/logger";
import { UpstreamError, type OsrmClient, type RouteResult } from "../src/osrmClient";

const SRC = "13.388860,52.517037";
const NEAR = "13.397634,52.529407";
const FAR = "13.428555,52.523219";

const limits = { maxDestinations: 50, maxConcurrency: 5 };

async function withServer(
  getRoute: OsrmClient["getRoute"],
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const app = createApp({ osrm: { getRoute }, limits, logger: silentLogger });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

const fakeOsrm = vi.fn<OsrmClient["getRoute"]>(async (_source, destination): Promise<RouteResult> => {
  if (destination.raw === NEAR) return { status: "ok", duration: 465.2, distance: 1879.4 };
  if (destination.raw === FAR) return { status: "ok", duration: 712.6, distance: 4123 };
  return { status: "unroutable", reason: "test" };
});

describe("GET /routes", () => {
  it("returns routes sorted fastest first, in the requested shape", async () => {
    await withServer(fakeOsrm, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/routes?src=${SRC}&dst=${FAR}&dst=${NEAR}`);

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/json");
      expect(await response.json()).toEqual({
        source: SRC,
        routes: [
          { destination: NEAR, duration: 465.2, distance: 1879.4 },
          { destination: FAR, duration: 712.6, distance: 4123 },
        ],
      });
    });
  });

  it("leaves out destinations that cannot be routed", async () => {
    await withServer(fakeOsrm, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/routes?src=${SRC}&dst=${NEAR}&dst=0,0`);
      const body = (await response.json()) as { routes: { destination: string }[] };

      expect(response.status).toBe(200);
      expect(body.routes.map((r) => r.destination)).toEqual([NEAR]);
    });
  });

  it("answers 400 with a message for bad input", async () => {
    await withServer(fakeOsrm, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/routes?src=${SRC}`);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "At least one dst is required" });
    });
  });

  it("answers 504 when OSRM times out", async () => {
    const timingOut = vi.fn<OsrmClient["getRoute"]>().mockRejectedValue(new UpstreamError("slow", "timeout"));
    await withServer(timingOut, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/routes?src=${SRC}&dst=${NEAR}`);
      expect(response.status).toBe(504);
    });
  });

  it("answers 502 when OSRM is unavailable", async () => {
    const down = vi.fn<OsrmClient["getRoute"]>().mockRejectedValue(new UpstreamError("down", "unavailable"));
    await withServer(down, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/routes?src=${SRC}&dst=${NEAR}`);
      expect(response.status).toBe(502);
    });
  });

  it("answers 500 without leaking details when something unexpected breaks", async () => {
    const broken = vi.fn<OsrmClient["getRoute"]>().mockRejectedValue(new Error("secret internal detail"));
    await withServer(broken, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/routes?src=${SRC}&dst=${NEAR}`);

      expect(response.status).toBe(500);
      expect(JSON.stringify(await response.json())).not.toContain("secret");
    });
  });
});

describe("other endpoints", () => {
  it("reports health", async () => {
    await withServer(fakeOsrm, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/health`);
      expect(await response.json()).toEqual({ status: "ok" });
    });
  });

  it("answers 404 for unknown paths", async () => {
    await withServer(fakeOsrm, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/nope`);
      expect(response.status).toBe(404);
    });
  });
});