// @vitest-environment node
import { describe, expect, it } from "vitest";
import { linkedOf, moreHref, SHOWN_STEP, shownOf } from "./shown";

const ID = "apr_7f31c0d2a9b84e15";

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

describe("linkedOf", () => {
    it("reads the request a link asks the page to list", () => {
        expect(linkedOf({ request: ID })).toBe(ID);
        expect(linkedOf({ request: [ID, "apr_0000000000000000"] })).toBe(ID);
    });

    it("ignores a missing value or one that is not a request id", () => {
        for (const request of [undefined, "", "apr_7F31C0D2A9B84E15", `${ID}0`, "grt_7f31c0d2a9b84e15"]) {
            expect(linkedOf({ request })).toBeUndefined();
        }
    });
});

describe("moreHref", () => {
    it("asks for one more step, and keeps the linked request", () => {
        expect(moreHref(100)).toBe("/approvals?shown=200");
        expect(moreHref(250)).toBe("/approvals?shown=350");
        expect(moreHref(100, ID)).toBe(`/approvals?shown=200&request=${ID}`);
    });
});
