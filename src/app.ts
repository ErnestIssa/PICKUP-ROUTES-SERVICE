import express, { type ErrorRequestHandler } from "express";
import type { Logger } from "./logger";
import type { OsrmClient } from "./osrmClient";
import { UpstreamError } from "./osrmClient";
import { createRoutesHandler, type RoutesHandlerDependencies } from "./routes";
import { ValidationError } from "./validation";

export type AppDependencies = RoutesHandlerDependencies & { osrm: OsrmClient; logger: Logger };

function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error, _req, res, _next) => {
    if (error instanceof ValidationError) {
      res.status(400).json({ error: error.message });
      return;
    }

    if (error instanceof UpstreamError) {
      logger.error("OSRM request failed", { kind: error.kind, error: error.message });
      res
        .status(error.kind === "timeout" ? 504 : 502)
        .json({ error: "The routing service is unavailable, please try again later" });
      return;
    }

    // Unknown problem: log the details, but do not leak them to the caller.
    logger.error("Unexpected error", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: "Internal server error" });
  };
}

export function createApp(dependencies: AppDependencies) {
  const app = express();
  app.disable("x-powered-by");

  // Used by load balancers and orchestrators to know the process is alive.
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.get("/routes", createRoutesHandler(dependencies));
  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });
  app.use(createErrorHandler(dependencies.logger));

  return app;
}