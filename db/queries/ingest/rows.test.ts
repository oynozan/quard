import { describe, expect, it } from "vitest";
import type { RunItem } from "./rows.ts";
import {
    content,
    decision,
    finished,
    handoff,
    item,
    memory,
    message,
    modelCall,
    RUN,
    started,
    STEP,
    toolCall,
    warning,
} from "../../test/events.ts";
import { agentMessageRows, decisionRows, eventRows, labelRows, runRows, stepRows } from "./rows.ts";

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
        expect(JSON.parse(String(model?.detail))).toMatchObject({ responseId: "resp_1", costUsd: 0.003075 });
        expect(tool).toMatchObject({ kind: "tool_call", name: "payInvoice", call_id: "call_1", status: "blocked" });
        expect(JSON.parse(String(tool?.detail))).toMatchObject({ arguments: { amount: 4950 } });
    });

    it("fills gaps when optional fields are missing", () => {
        const model = { ...modelCall(), parentStepId: "4".repeat(16), usage: undefined } as RunItem["event"];
        const bare = { ...toolCall("ok"), callId: undefined, keys: undefined } as RunItem["event"];
        const [withParent, tool] = stepRows(PROJECT, [item(model), item(bare)]);

        expect(withParent?.parent_step_id).toBe("4".repeat(16));
        expect(JSON.parse(String(withParent?.detail))).toMatchObject({ usage: null, costUsd: null });
        expect(tool?.call_id).toBeNull();
        expect(JSON.parse(String(tool?.detail)).keys).toEqual([]);
        expect(JSON.parse(String(withParent?.detail))).not.toHaveProperty("agentVersion");
    });

    it("keeps the agent version of a model call", () => {
        const [model] = stepRows(PROJECT, [item({ ...modelCall(), agentVersion: "b".repeat(16) })]);

        expect(JSON.parse(String(model?.detail))).toMatchObject({ agentVersion: "b".repeat(16) });
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
        const bare = { ...decision(), reason: undefined, field: undefined } as RunItem["event"];

        expect(decisionRows(PROJECT, [item(bare)])[0]).toMatchObject({
            reason: null,
            field: null,
            rules_hash: null,
            request_id: null,
        });
    });

    it("keep the active rules hash and the approval request of a decision", () => {
        const answered = { ...decision(), rules: "a".repeat(16), request: "apr_0123456789abcdef" };

        expect(decisionRows(PROJECT, [item(answered)])[0]).toMatchObject({
            rules_hash: "a".repeat(16),
            request_id: "apr_0123456789abcdef",
        });
    });
});

describe("agentMessageRows", () => {
    it("turns a message into an edge from the sender to the receiver", () => {
        const received = item(message());

        expect(agentMessageRows(PROJECT, [received])).toEqual([
            {
                project_id: PROJECT,
                event_id: received.id,
                run_id: RUN,
                step_id: "5".repeat(16),
                kind: "message",
                from_agent: "orchestrator",
                to_agent: "billing",
                parent_step_id: STEP,
                trust: "untrusted",
                sensitivity: "public",
                verified: true,
                at: "2026-10-03T12:00:04.000Z",
            },
        ]);
    });

    it("keeps an unverified message from an unknown sender with no parent step", () => {
        const unknown = { ...message(), from: "unknown", parentStepId: undefined, verified: false };

        expect(agentMessageRows(PROJECT, [item(unknown as RunItem["event"])])[0]).toMatchObject({
            from_agent: "unknown",
            parent_step_id: null,
            verified: false,
        });
    });

    it("turns handoffs and agents run as tools into edges from the agent", () => {
        const [passed, asTool] = agentMessageRows(PROJECT, [item(handoff()), item(handoff("tool"))]);

        expect(passed).toMatchObject({
            kind: "handoff",
            from_agent: "billing",
            to_agent: "refunds",
            parent_step_id: null,
            trust: "trusted",
            sensitivity: "internal",
            verified: true,
        });
        expect(asTool).toMatchObject({ kind: "tool", from_agent: "billing", to_agent: "refunds" });
    });

    it("skips every other event, memory included", () => {
        expect(agentMessageRows(PROJECT, [item(started()), item(memory()), item(modelCall())])).toEqual([]);
    });
});
