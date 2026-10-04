// @vitest-environment node
import { describe, expect, it } from "vitest";
import { limitCount } from "./sections";

describe("limitCount", () => {
    it("counts runs an observe-mode limit would stop and runs a block-mode limit stopped", () => {
        const loops = { name: "loops", rule: "max-loops", mode: "observe", wouldStop: 3, stopped: 1 } as const;

        expect(limitCount(loops)).toBe(3);
        expect(limitCount({ ...loops, mode: "block" })).toBe(1);
    });
});
