import { describe, expect, it } from "vitest";
import { mattersHere, parseChange } from "./change";

const RUN = "a".repeat(32);
const OTHER = "b".repeat(32);

describe("parseChange", () => {
    it("reads a change with or without its runs", () => {
        expect(parseChange(`{"topic":"runs","runs":["${RUN}"]}`)).toEqual({ topic: "runs", runs: [RUN] });
        expect(parseChange('{"topic":"approvals"}')).toEqual({ topic: "approvals" });
    });

    it("turns away data that is not a change", () => {
        expect(parseChange("not json")).toBeNull();
        expect(parseChange("null")).toBeNull();
        expect(parseChange("7")).toBeNull();
        expect(parseChange('{"runs":[]}')).toBeNull();
    });
});

describe("mattersHere", () => {
    it("lets every change refresh pages that are not a run page", () => {
        expect(mattersHere({ topic: "runs", runs: [OTHER] }, "/runs")).toBe(true);
        expect(mattersHere({ topic: "fleet" }, "/")).toBe(true);
    });

    it("keeps a run page to changes for its own run", () => {
        expect(mattersHere({ topic: "runs", runs: [RUN] }, `/runs/${RUN}`)).toBe(true);
        expect(mattersHere({ topic: "runs", runs: [OTHER] }, `/runs/${RUN}`)).toBe(false);
        expect(mattersHere({ topic: "runs" }, `/runs/${RUN}`)).toBe(true);
        expect(mattersHere({ topic: "approvals" }, `/runs/${RUN}`)).toBe(true);
    });
});
