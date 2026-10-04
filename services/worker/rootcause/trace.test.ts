import { describe, expect, it } from "vitest";
import { at, label, step, STEP } from "../test/runs.ts";
import { traceValues } from "./trace.ts";

const page = label({ contentId: "c2", stepId: STEP.fetch, keys: ["host:acme.com", "domain:acme.com"], at: at(20) });
const prompt = label({
    contentId: "c1",
    stepId: STEP.ask,
    keys: ["url:https://acme.com/a", "host:acme.com"],
    at: at(10),
});
// A model call that ran from 50 to 55 ms
const turning = step({ stepId: STEP.decide, kind: "model_call", name: "test-model", at: at(55), durationMs: 5 });
const late = label({ contentId: "c3", stepId: STEP.end, keys: ["url:https://acme.com/a"], at: at(90) });

describe("traceValues", () => {
    it("lists where each value appeared before the turning call started, first appearance first", () => {
        const [url, host, domain] = traceValues(
            ["url:https://acme.com/a", "host:acme.com", "domain:acme.com"],
            [late, page, prompt],
            turning,
        );

        expect(url?.appearances.map((item) => [item.contentId, item.match])).toEqual([["c1", "value"]]);
        expect(host?.appearances.map((item) => [item.contentId, item.match])).toEqual([
            ["c1", "host"],
            ["c2", "host"],
        ]);
        expect(domain).toMatchObject({ generated: false, appearances: [{ contentId: "c2", match: "domain" }] });
    });

    it("keeps the label but not its keys on each appearance", () => {
        const [url] = traceValues(["url:https://acme.com/a"], [prompt], turning);

        expect(url?.appearances[0]).toEqual({ ...prompt, keys: undefined, match: "value" });
        expect(url?.appearances[0]).not.toHaveProperty("keys");
    });

    it("marks a value found nowhere as model-generated", () => {
        expect(traceValues(["id:INV-2026-0001"], [prompt, page], turning)).toEqual([
            { key: "id:INV-2026-0001", appearances: [], generated: true },
        ]);
    });
});
