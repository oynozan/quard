// @vitest-environment node
import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
    it("joins class names and skips falsy ones", () => {
        expect(cn("rounded", false, null, undefined, "text-sm")).toBe("rounded text-sm");
    });

    it("lets a later Tailwind class win over a clashing one", () => {
        expect(cn("px-2 text-sm", "px-4")).toBe("text-sm px-4");
    });
});
