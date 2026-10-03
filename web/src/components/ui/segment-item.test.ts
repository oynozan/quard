// @vitest-environment node
import { describe, expect, it } from "vitest";
import { SELECTED_ACTIVE, SELECTED_PRESSED, segmentItem } from "./segment-item";

describe("segmentItem", () => {
    it("fits the 32px toolbar row when small", () => {
        const classes = segmentItem("sm", SELECTED_PRESSED).split(" ");
        expect(classes).toEqual(expect.arrayContaining(["h-8", "text-[13px]", "data-pressed:text-signal"]));
    });

    it("matches the 37px nav item when medium", () => {
        const classes = segmentItem("md", SELECTED_ACTIVE).split(" ");
        expect(classes).toEqual(expect.arrayContaining(["min-h-[37px]", "text-[14px]", "data-active:text-signal"]));
        expect(classes).not.toContain("h-8");
    });
});
