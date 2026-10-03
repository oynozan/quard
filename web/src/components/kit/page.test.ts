// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PAGE_LIST, PAGE_WIDE } from "./page";

describe("page containers", () => {
    it("centers wide pages under a maximum width", () => {
        expect(PAGE_WIDE.split(" ")).toEqual(expect.arrayContaining(["mx-auto", "max-w-[1740px]"]));
    });

    it("lets list pages run full width", () => {
        expect(PAGE_LIST).not.toContain("mx-auto");
        expect(PAGE_LIST).not.toContain("max-w-");
    });
});
