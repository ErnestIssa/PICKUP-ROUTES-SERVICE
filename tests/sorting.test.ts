import { describe, expect, it } from "vitest";
import { sortRoutes } from "../src/sorting";

describe("sortRoutes", () => {
  it("puts the shortest duration first", () => {
    const sorted = sortRoutes([
      { destination: "b", duration: 712.6, distance: 4123 },
      { destination: "a", duration: 465.2, distance: 1879.4 },
    ]);
    expect(sorted.map((r) => r.destination)).toEqual(["a", "b"]);
  });

  it("uses distance as the tie-breaker when durations are equal", () => {
    const sorted = sortRoutes([
      { destination: "far", duration: 300, distance: 2000 },
      { destination: "near", duration: 300, distance: 1500 },
    ]);
    expect(sorted.map((r) => r.destination)).toEqual(["near", "far"]);
  });

  it("does not change the list it was given", () => {
    const input = [
      { destination: "b", duration: 2, distance: 1 },
      { destination: "a", duration: 1, distance: 1 },
    ];
    sortRoutes(input);
    expect(input[0]?.destination).toBe("b");
  });
});