import { describe, expect, it } from "vitest";
import { z } from "zod";
import { describeError } from "./errors.ts";

describe("describeError", () => {
    it("explains: schema errors field by field", () => {
        const result = z.strictObject({ n: z.number() }).safeParse({ n: "x" });
        expect(result.success).toBe(false);
        expect(describeError(result.error)).toContain("n");
    });

    it("explains: an Error by its message", () => {
        expect(describeError(new RangeError("too far"))).toBe("too far");
    });

    it("explains: anything else as text", () => {
        expect(describeError("plain")).toBe("plain");
        expect(describeError(42)).toBe("42");
    });
});
