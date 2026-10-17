import { describe, expect, it } from "vitest";
import { parseRoutesRequest, ValidationError } from "../src/validation";

const SRC = "13.388860,52.517037";
const DST_A = "13.397634,52.529407";
const DST_B = "13.428555,52.523219";

describe("parseRoutesRequest", () => {
    it("accepts one src and several dst", () => {
        const result = parseRoutesRequest({ src: SRC, dst: [DST_A, DST_B] }, 50); 
        expect(result.destinations).toHaveLength(2);
        expect(result.source.lon).toBe(13.38886);
        expect(result.source.lat).toBe(52.517037);
    });

    it("accepts a single dst given as plain string", () => {
        const result = parseRoutesRequest({ src: SRC, dst: DST_A }, 50);
        expect(result.destinations).toHaveLength(1);
    });

    it("keeps the source text exactly as sent", () => {
        const result = parseRoutesRequest({ src: SRC, dst: DST_A }, 50);
        expect(result.source.raw).toBe(SRC);
    });

    it("rejects a missing src", () => {
    expect(() => parseRoutesRequest({ dst: DST_A }, 50)).toThrow(ValidationError);
    });

    it("rejects more than one src", () => {
    expect(() => parseRoutesRequest({ src: [SRC, SRC], dst: DST_A }, 50)).toThrow(
      "Exactly one src",
        );
    });

    it("rejects a missing dst", () => {
        expect(() => parseRoutesRequest({ src: SRC }, 50)).toThrow("At least one dst");
    });

    it.each(["abc", "1,2,3", "13.38", "13.38;52.5", " 13.38,52.5", "13.38,"])(
    "rejects the malformed coordinate %j",
    (bad) => {
      expect(() => parseRoutesRequest({ src: bad, dst: DST_A }, 50)).toThrow(ValidationError);
        },
    );

    it.each(["181,10", "-181,10", "10,91", "10,-91"])(
    "rejects the out-of-range coordinate %j",
    (bad) => {
      expect(() => parseRoutesRequest({ src: SRC, dst: bad }, 50)).toThrow(ValidationError);
    },
  );


    it("removes duplicate destinations, keeping the first", () => {
    const result = parseRoutesRequest({ src: SRC, dst: [DST_A, "13.3976340,52.529407", DST_B] }, 50);
    expect(result.destinations.map((d) => d.raw)).toEqual([DST_A, DST_B]);
  });

  it("rejects too many destinations", () => {
    expect(() => parseRoutesRequest({ src: SRC, dst: [DST_A, DST_B, DST_A] }, 2)).toThrow(
      "At most 2",
    );
  });
});

