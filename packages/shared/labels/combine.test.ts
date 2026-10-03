import { describe, expect, it } from "vitest";
import { combineLabels } from "./combine.ts";
import { labelFor } from "./mapping.ts";

describe("combineLabels", () => {
    it("is trusted and public when nothing was read", () => {
        expect(combineLabels([])).toEqual({ trust: "trusted", sensitivity: "public", origins: [], flagged: false });
    });

    it("takes the least trusted and most sensitive label", () => {
        const labels = [labelFor("user"), labelFor("web:evil.com", {}, ["instructions"]), labelFor("user")];

        expect(combineLabels(labels)).toEqual({
            trust: "untrusted",
            sensitivity: "internal",
            origins: ["user", "web:evil.com"],
            flagged: true,
        });
    });
});
