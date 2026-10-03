import { describe, expect, it } from "vitest";
import type { RunEvent } from "@quard/shared";
import { content, decision, finished, item, modelCall, RUN, started, toolCall, warning } from "../../test/events.ts";
import { decisionRows, eventRows, labelRows, runRows, stepRows } from "./rows.ts";

const PROJECT = "00000000-0000-0000-0000-000000000001";

describe("runRows", () => {
    it("spans each run from its first to its last event", () => {
        const rows = runRows(PROJECT, [item(modelCall("2026-10-03T12:00:05.000Z")), item(started(), true)]);

        expect(rows).toEqual([
            {
                project_id: PROJECT,
                run_id: RUN,
                agent: "billing",
                started_at: new Date("2026-10-03T12:00:00.000Z"),
                last_event_at: new Date("2026-10-03T12:00:05.000Z"),
                degraded: true,
            },
        ]);
    });
});

describe("eventRows", () => {
    it("keeps each event whole, with its id and step", () => {
        const [start, call, end] = eventRows(PROJECT, [item(started()), item(modelCall(), true), item(finished())]);

        expect(start).toMatchObject({ run_id: RUN, step_id: null, type: "run_started", degraded: false });
        expect(call).toMatchObject({ step_id: "2".repeat(16), type: "model_call", degraded: true });
        expect(end).toMatchObject({ step_id: null, type: "run_finished" });
        expect(JSON.parse(String(call?.body))).toEqual(modelCall());
    });
});

describe("stepRows", () => {
    it("turns model calls and tool calls into steps", () => {
        const [model, tool] = stepRows(PROJECT, [item(modelCall()), item(toolCall()), item(content())]);

        expect(model).toMatchObject({
            kind: "model_call",
            name: "gpt-5.4-mini",
            parent_step_id: null,
            duration_ms: 812,
        });
        // 1000 fresh and 1000 cached input tokens, and 500 output tokens, at gpt-5.4-mini prices
        expect(JSON.parse(String(model?.detail))).toMatchObject({ responseId: "resp_1", costUsd: 0.0031 });
        expect(tool).toMatchObject({ kind: "tool_call", name: "payInvoice", call_id: "call_1", status: "blocked" });
        expect(JSON.parse(String(tool?.detail))).toMatchObject({ arguments: { amount: 4950 } });
    });

    it("fills gaps when optional fields are missing", () => {
        const model = { ...modelCall(), parentStepId: "4".repeat(16), usage: undefined } as RunEvent;
        const bare = { ...toolCall("ok"), callId: undefined, keys: undefined } as RunEvent;
        const [withParent, tool] = stepRows(PROJECT, [item(model), item(bare)]);

        expect(withParent?.parent_step_id).toBe("4".repeat(16));
        expect(JSON.parse(String(withParent?.detail))).toMatchObject({ usage: null, costUsd: null });
        expect(tool?.call_id).toBeNull();
        expect(JSON.parse(String(tool?.detail)).keys).toEqual([]);
    });
});

describe("labelRows and decisionRows", () => {
    it("keep labels and decisions, and skip other events", () => {
        const items = [item(content()), item(decision()), item(warning())];

        expect(labelRows(PROJECT, items)).toEqual([
            expect.objectContaining({ content_id: "c1", trust: "untrusted", flags: ["instructions"] }),
        ]);
        expect(decisionRows(PROJECT, items)).toEqual([
            expect.objectContaining({ guard: "action", reason: "value_not_from_allowed_origin", field: "iban" }),
        ]);
    });

    it("store missing reasons and fields as null", () => {
        const bare = { ...decision(), reason: undefined, field: undefined } as RunEvent;

        expect(decisionRows(PROJECT, [item(bare)])[0]).toMatchObject({ reason: null, field: null });
    });
});
