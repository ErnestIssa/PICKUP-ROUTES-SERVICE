import type { Coordinate } from "./validation";

export interface OsrmClientOptions {
  baseUrl: string;
  timeoutMs: number;
  /** Extra attempts after the first one, for temporary failures only. */
  maxRetries: number;
  retryDelayMs: number;
  /** A point OSRM had to move further than this to reach a road is not trusted. */
  maxSnapDistanceM: number;
}

export type RouteResult =
  | { status: "ok"; duration: number; distance: number }
  | { status: "unroutable"; reason: string };

export type UpstreamErrorKind = "timeout" | "unavailable" | "bad_response";

/** OSRM is down, slow, or sent something we cannot trust. The HTTP layer turns it into a 502/504. */
export class UpstreamError extends Error {
  constructor(
    message: string,
    public readonly kind: UpstreamErrorKind,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

interface OsrmBody {
  code?: unknown;
  routes?: { duration?: unknown; distance?: unknown }[];
  waypoints?: { distance?: unknown }[];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function toUpstreamError(error: unknown): UpstreamError {
  if (error instanceof UpstreamError) return error;
  if (error instanceof Error && error.name === "TimeoutError") {
    return new UpstreamError("OSRM request timed out", "timeout");
  }
  return new UpstreamError("Could not reach OSRM", "unavailable");
}

export function createOsrmClient(options: OsrmClientOptions, fetchImpl: typeof fetch = fetch) {
  function unroutable(reason: string): RouteResult {
    return { status: "unroutable", reason };
  }

  function interpret(body: unknown): RouteResult {
    if (typeof body !== "object" || body === null) {
      throw new UpstreamError("OSRM sent an unexpected response", "bad_response");
    }
    const data = body as OsrmBody;

    if (data.code === "NoRoute" || data.code === "NoSegment") {
      return unroutable(`OSRM code ${data.code}`);
    }
    if (data.code !== "Ok") {
      throw new UpstreamError(`OSRM returned code ${String(data.code)}`, "bad_response");
    }

    const route = data.routes?.[0];
    if (typeof route?.duration !== "number" || typeof route.distance !== "number") {
      throw new UpstreamError("OSRM response is missing expected fields", "bad_response");
    }

    // OSRM moves each point to the nearest road and still says "Ok", even when
    // that road is far away (e.g. a point in the ocean). Do not trust those routes.
    // The snap distance is optional: if OSRM does not send it, the check is skipped.
    const snapDistances = (data.waypoints ?? [])
      .map((waypoint) => waypoint.distance)
      .filter((distance): distance is number => typeof distance === "number");
    const worstSnap = snapDistances.length > 0 ? Math.max(...snapDistances) : 0;
    if (worstSnap > options.maxSnapDistanceM) {
      return unroutable(`point is ${Math.round(worstSnap)} m from the nearest road`);
    }

    return { status: "ok", duration: route.duration, distance: route.distance };
  }

  async function requestOnce(url: string): Promise<RouteResult> {
    try {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(options.timeoutMs) });
      if (response.status >= 500) {
        throw new UpstreamError(`OSRM answered with HTTP ${response.status}`, "unavailable");
      }
      // OSRM sends its error codes (like NoRoute) as JSON with a 4xx status, so read the body either way.
      const body: unknown = await response.json();
      return interpret(body);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new UpstreamError("OSRM sent a response that is not JSON", "bad_response");
      }
      throw toUpstreamError(error);
    }
  }

  async function getRoute(source: Coordinate, destination: Coordinate): Promise<RouteResult> {
    // Safe to build the URL from the raw text: validation guarantees it is just two numbers.
    const url =
      `${options.baseUrl}/route/v1/driving/${source.raw};${destination.raw}?overview=false`;

    for (let attempt = 0; ; attempt++) {
      try {
        return await requestOnce(url);
      } catch (error) {
        const retryable = error instanceof UpstreamError && error.kind !== "bad_response";
        if (!retryable || attempt >= options.maxRetries) throw error;
        await sleep(options.retryDelayMs);
      }
    }
  }

  return { getRoute };
}

export type OsrmClient = ReturnType<typeof createOsrmClient>;