import { describe, expect, it } from "vitest";
import { createJsonLogger } from "../src/logger";

describe("createJsonLogger", () => {
  it("keeps the log message even if a field tries to overwrite it", () => {
    const lines: string[] = [];
    const logger = createJsonLogger((line) => lines.push(line));

    logger.error("Invalid configuration", { message: "something else", error: "PORT must be a number" });

    const entry = JSON.parse(lines[0] as string);
    expect(entry.message).toBe("Invalid configuration");
    expect(entry.level).toBe("error");
    expect(entry.error).toBe("PORT must be a number");
  });
});
