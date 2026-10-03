import { describe, expect, it } from "vitest";
import * as sdk from "./index.ts";

describe("quard", () => {
    it("exports its public API", () => {
        expect(Object.keys(sdk).sort()).toEqual(["GUARD_TYPES", "isGuardType"]);
    });
});
