import { describe, expect, it } from "vitest";
import * as sdk from "./index.ts";

describe("quard", () => {
    it("exports its public API", () => {
        expect(Object.keys(sdk).sort()).toEqual([
            "DetectorError",
            "GUARD_TYPES",
            "GuardBlockedError",
            "GuardRefusal",
            "guard",
            "isGuardRefusal",
            "isGuardType",
            "jevDetector",
            "quard",
        ]);
        expect(Object.keys(sdk.quard)).toEqual([
            "wrap",
            "run",
            "agent",
            "inject",
            "resume",
            "toBaggage",
            "configure",
            "memory",
            "x402Fetch",
            "x402Mcp",
        ]);
    });
});
