import { createApp } from "./app";
import { loadConfig } from "./config";
import { createJsonLogger } from "./logger";
import { createOsrmClient } from "./osrmClient";

const logger = createJsonLogger();

let config;
try {
  config = loadConfig();
} catch (error) {
  logger.error("Invalid configuration", { message: error instanceof Error ? error.message : String(error) });
  process.exit(1);
}

const app = createApp({
  osrm: createOsrmClient(config.osrm),
  limits: config,
  logger,
});

const server = app.listen(config.port, () => {
  logger.info("Server listening", { port: config.port, osrm: config.osrm.baseUrl });
});

// On shutdown: stop accepting new requests, let running ones finish, then exit.
function shutdown(signal: string): void {
  logger.info("Shutting down", { signal });
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref(); // safety net if something hangs
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));