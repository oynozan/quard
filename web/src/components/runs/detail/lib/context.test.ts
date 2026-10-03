// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Label } from "@/lib/data/types";
import { TRUSTED_INTERNAL, UNTRUSTED_PUBLIC } from "../../../../../test/runs-timeline-lib/steps";
import { CONTEXTS, contextKey, contextStyle } from "./context";

describe("contextKey", () => {
    it("joins trust and sensitivity", () => {
        expect(contextKey(TRUSTED_INTERNAL)).toBe("trusted-internal");
        expect(contextKey(UNTRUSTED_PUBLIC)).toBe("untrusted-public");
    });
});

describe("contextStyle", () => {
    it("gives every context its own word, and marks untrusted ones", () => {
        for (const context of CONTEXTS) {
            const [trust, sensitivity] = context.key.split("-") as [Label["trust"], Label["sensitivity"]];
            const style = contextStyle({ origin: "x", trust, sensitivity });
            expect(style).toBe(context);
            expect(style.untrusted).toBe(trust === "untrusted");
        }
        expect(contextStyle(UNTRUSTED_PUBLIC).word).toBe("Untrusted public");
    });

    it("falls back to trusted public for a label it does not know", () => {
        const odd = { origin: "x", trust: "unknown", sensitivity: "secret" } as unknown as Label;
        expect(contextStyle(odd).key).toBe("trusted-public");
    });
});
