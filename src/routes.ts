import type { RequestHandler } from "express";
import type { Config } from "./config";
import { mapWithConcurrency } from "./concurrency";
import type { Logger } from "./logger";
import type { OsrmClient } from "./osrmClient";
import { sortRoutes, type RouteEntry } from "./sorting";
import { parseRoutesRequest } from "./validation";

export interface RoutesHandlerDependencies {
  osrm: OsrmClient;
  limits: Pick<Config, "maxDestinations" | "maxConcurrency">;
  logger: Logger;
}

export function createRoutesHandler({ osrm, limits, logger }: RoutesHandlerDependencies): RequestHandler {
  return async (req, res, next) => {
    try {
      const { source, destinations } = parseRoutesRequest(req.query, limits.maxDestinations);

      const outcomes = await mapWithConcurrency(
        destinations,
        limits.maxConcurrency,
        async (destination) => ({ destination, result: await osrm.getRoute(source, destination) }),
      );

      const routes: RouteEntry[] = [];
      for (const { destination, result } of outcomes) {
        if (result.status === "ok") {
          routes.push({
            destination: destination.raw,
            duration: result.duration,
            distance: result.distance,
          });
        } else {
          logger.warn("Destination skipped", { destination: destination.raw, reason: result.reason });
        }
      }

      res.json({ source: source.raw, routes: sortRoutes(routes) });
    } catch (error) {
      next(error); // the error handler in app.ts decides the status code
    }
  };
}