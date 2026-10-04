import { describe, expect, it } from "vitest";
import { bearerToken } from "./bearer.ts";

describe("bearerToken", () => {
    it("reads the token after Bearer, in any case", () => {
        expect(bearerToken("Bearer qk_live_abc")).toBe("qk_live_abc");
        expect(bearerToken("bearer   qk_live_abc")).toBe("qk_live_abc");
    });

    it.each([
        ["no header", undefined],
        ["an empty header", ""],
        ["another scheme", "Basic qk_live_abc"],
        ["no token", "Bearer "],
        ["two tokens", "Bearer a b"],
    ])("gives undefined for %s", (_, header) => {
        expect(bearerToken(header)).toBeUndefined();
    });
});
