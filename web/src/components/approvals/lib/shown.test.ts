// @vitest-environment node
import { describe, expect, it } from "vitest";
import { moreHref, SHOWN_STEP, shownOf } from "./shown";

describe("shownOf", () => {
    it("reads how many open requests the address asks for", () => {
        expect(SHOWN_STEP).toBe(100);
        expect(shownOf({ shown: "200" })).toBe(200);
        expect(shownOf({ shown: ["300", "400"] })).toBe(300);
    });

    it("shows the first step for a missing, small or broken value", () => {
        for (const shown of [undefined, "", "20", "-300", "250.5", "lots", "1e400"]) {
            expect(shownOf({ shown })).toBe(SHOWN_STEP);
        }
    });
});

describe("moreHref", () => {
    it("asks for one more step", () => {
        expect(moreHref(100)).toBe("/approvals?shown=200");
        expect(moreHref(250)).toBe("/approvals?shown=350");
    });
});
