import { describe, expect, it } from "vitest";
import * as sdk from "./index.ts";

describe("quard", () => {
    it("exports its public API", () => {
        expect(Object.keys(sdk).sort()).toEqual([
            "GUARD_TYPES",
            "GuardBlockedError",
            "GuardRefusal",
            "guard",
            "isGuardRefusal",
            "isGuardType",
            "jevDetector",
            "quard",
        ]);
        expect(Object.keys(sdk.quard)).toEqual(["wrap", "run", "agent", "configure"]);
    });
});
