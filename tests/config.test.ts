import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";

describe("loadConfig", () => {
  it("uses safe defaults when nothing is set", () => {
    const config = loadConfig({});
    expect(config.port).toBe(3000);
    expect(config.maxDestinations).toBe(50);
    expect(config.osrm.baseUrl).toBe("http://router.project-osrm.org");
    expect(config.osrm.maxSnapDistanceM).toBe(1000);
  });

  it("reads overrides and removes a trailing slash from the OSRM URL", () => {
    const config = loadConfig({ PORT: "8080", OSRM_BASE_URL: "http://localhost:5000/" });
    expect(config.port).toBe(8080);
    expect(config.osrm.baseUrl).toBe("http://localhost:5000");
  });

  it("fails loudly on a value that is not a number", () => {
    expect(() => loadConfig({ PORT: "abc" })).toThrow("PORT");
  });

  it("fails on a value below the minimum", () => {
    expect(() => loadConfig({ MAX_CONCURRENCY: "0" })).toThrow("MAX_CONCURRENCY");
  });
});