import { describe, expect, it } from "vitest";
import { at, label, step, STEP } from "../test/runs.ts";
import { pickEntry } from "./entry.ts";
import type { Match, TracedValue } from "./trace.ts";

const turning = step({ stepId: STEP.decide, kind: "model_call", name: "test-model", at: at(59) });

function seen(key: string, contentId: string, match: Match, ms: number): TracedValue {
    const content = label({
        contentId,
        stepId: STEP.fetch,
        origin: "web:evil-pay.com",
        trust: "untrusted",
        at: at(ms),
    });
    return { key, generated: false, appearances: [{ ...content, match }] };
}

describe("pickEntry", () => {
    it("prefers content that held the value itself to content that only shared its domain", () => {
        const values = [
            seen("domain:evil-pay.com", "c1", "domain", 10),
            seen("url:https://evil-pay.com/x", "c2", "value", 20),
        ];

        expect(pickEntry(values, [], turning)).toMatchObject({ contentId: "c2", key: "url:https://evil-pay.com/x" });
    });

    it("takes the earliest of two equally strong matches", () => {
        const values = [seen("id:INV-77", "c3", "value", 30), seen("url:https://evil-pay.com/x", "c2", "value", 20)];

        expect(pickEntry(values, [], turning)).toMatchObject({ contentId: "c2" });
    });

    it("reads flagged content first, then the earliest", () => {
        const read = [
            label({ contentId: "c1", stepId: STEP.fetch, trust: "untrusted", at: at(10) }),
            label({ contentId: "c3", stepId: STEP.fetch, trust: "untrusted", flags: ["instructions"], at: at(30) }),
            label({ contentId: "c2", stepId: STEP.fetch, trust: "untrusted", flags: ["hidden_text"], at: at(20) }),
        ];

        expect(pickEntry([], read, turning)).toMatchObject({ contentId: "c2", key: null });
    });
});
