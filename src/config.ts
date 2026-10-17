import type { OsrmClientOptions } from "./osrmClient";

export interface Config {
  port: number;
  maxDestinations: number;
  maxConcurrency: number;
  osrm: OsrmClientOptions;
}

function readInt(env: NodeJS.ProcessEnv, name: string, fallback: number, min: number): number {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;

  const value = Number(raw);
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`${name} must be a whole number of at least ${min}, got "${raw}"`);
  }
  return value;
}

/** Reads settings from environment variables. Every setting has a safe default. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: readInt(env, "PORT", 3000, 1),
    maxDestinations: readInt(env, "MAX_DESTINATIONS", 50, 1),
    maxConcurrency: readInt(env, "MAX_CONCURRENCY", 5, 1),
    osrm: {
      baseUrl: (env.OSRM_BASE_URL || "http://router.project-osrm.org").replace(/\/+$/, ""),
      timeoutMs: readInt(env, "OSRM_TIMEOUT_MS", 3000, 1),
      maxRetries: readInt(env, "OSRM_MAX_RETRIES", 1, 0),
      retryDelayMs: readInt(env, "OSRM_RETRY_DELAY_MS", 200, 0),
      maxSnapDistanceM: readInt(env, "MAX_SNAP_DISTANCE_M", 1000, 0),
    },
  };
}