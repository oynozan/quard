import type { RunHandoff, RunLabel, RunMemory, RunMessage } from "@quard/db";
import { describe, expect, it } from "vitest";
import { agentSteps, edgesOf } from "./links";

const BASE = Date.UTC(2026, 9, 3, 12, 0, 0);
const at = (seconds: number) => new Date(BASE + seconds * 1000);
const RECEIVE = "1".repeat(16);
const SENDER_STEP = "2".repeat(16);

function message(fields: Partial<RunMessage> = {}): RunMessage {
    return {
        type: "message",
        eventId: "e".repeat(16),
        stepId: RECEIVE,
        agent: "billing",
        at: at(4),
        from: "orchestrator",
        parentStepId: SENDER_STEP,
        labelRef: "a".repeat(16),
        verified: true,
        trust: "trusted",
        sensitivity: "internal",
        ...fields,
    };
}

function handoff(fields: Partial<RunHandoff> = {}): RunHandoff {
    return {
        type: "handoff",
        eventId: "f".repeat(16),
        stepId: SENDER_STEP,
        agent: "triage",
        at: at(5),
        to: "refunds",
        via: "handoff",
        trust: "trusted",
        sensitivity: "public",
        ...fields,
    };
}

function memory(fields: Partial<RunMemory> = {}): RunMemory {
    return {
        type: "memory",
        eventId: "d".repeat(16),
        stepId: "7".repeat(16),
        agent: "billing",
        at: at(6),
        store: "notes",
        op: "read",
        items: 2,
        verified: 2,
        trust: "trusted",
        sensitivity: "internal",
        ...fields,
    };
}

// A web page the agent read before the event, and one after it
const labels: RunLabel[] = [
    {
        contentId: "c1",
        stepId: "9".repeat(16),
        agent: "billing",
        origin: "web:acme.net",
        trust: "untrusted",
        sensitivity: "public",
        flags: [],
        keys: [],
        at: at(1),
    },
    {
        contentId: "c2",
        stepId: "9".repeat(16),
        agent: "billing",
        origin: "mcp:crm",
        trust: "trusted",
        sensitivity: "internal",
        flags: [],
        keys: [],
        at: at(30),
    },
];

describe("agentSteps", () => {
    it("turns a verified message into a step under the receive call, with the label it carries", () => {
        const [step] = agentSteps([message()], []);
        const carried = { origin: "agent:orchestrator", trust: "trusted", sensitivity: "internal" };
        expect(step).toMatchObject({
            id: "e".repeat(16),
            parentId: RECEIVE,
            agent: "billing",
            kind: "message",
            name: "orchestrator → billing",
            startedAt: BASE + 4000,
            durationMs: 0,
            status: "ok",
            context: carried,
            influenced: false,
            detail: "",
            memory: null,
            guard: null,
        });
        expect(step.link).toEqual({
            kind: "message",
            from: "orchestrator",
            to: "billing",
            channel: null,
            carries: [carried],
            labelRef: "a".repeat(16),
            untrusted: false,
            verified: true,
            summary: "",
        });
    });

    it("marks a message no record vouched for as untrusted, naming it in the context", () => {
        const unknown = message({
            from: "unknown",
            verified: false,
            labelRef: null,
            parentStepId: null,
            trust: "untrusted",
            sensitivity: "internal",
        });
        const [step] = agentSteps([unknown], labels);
        expect(step).toMatchObject({
            name: "unknown → billing",
            detail: "Unverified · read as untrusted",
            context: { origin: "agent:unknown", trust: "untrusted", sensitivity: "internal" },
            influenced: true,
        });
        expect(step.link).toMatchObject({ untrusted: true, verified: false, labelRef: null });
        expect(step.link?.summary).toBe("Unverified · read as untrusted");
    });

    it("counts a trusted message without a record as untrusted, and reads what came before it", () => {
        const [step] = agentSteps([message({ verified: false })], labels);
        expect(step.link?.untrusted).toBe(true);
        expect(step.context).toEqual({ origin: "web:acme.net", trust: "untrusted", sensitivity: "internal" });
    });

    it("turns a handoff into an in-process link from the agent, and an agent run as a tool into a delegation", () => {
        const [passed, asTool] = agentSteps(
            [handoff(), handoff({ eventId: "c".repeat(16), via: "tool", trust: "untrusted" })],
            [],
        );
        expect(passed).toMatchObject({
            id: "f".repeat(16),
            parentId: SENDER_STEP,
            agent: "triage",
            kind: "handoff",
            name: "triage → refunds",
            detail: "",
            context: { origin: "agent:triage", trust: "trusted", sensitivity: "public" },
        });
        expect(passed.link).toMatchObject({
            kind: "handoff",
            channel: "in-process",
            labelRef: null,
            untrusted: false,
            verified: true,
        });
        expect(asTool).toMatchObject({ detail: "Ran refunds as a tool", influenced: true });
        expect(asTool.link).toMatchObject({ kind: "delegation", untrusted: true, summary: "Ran refunds as a tool" });
    });

    it("turns memory reads and writes into steps that name the store", () => {
        const [read, write] = agentSteps(
            [memory(), memory({ eventId: "b".repeat(16), op: "write", items: 1, verified: 1 })],
            [],
        );
        const label = { origin: "memory:notes", trust: "trusted", sensitivity: "internal" };
        expect(read).toMatchObject({ kind: "memory_read", name: "notes", parentId: null, detail: "Read 2 items" });
        expect(read.memory).toEqual({ store: "notes", op: "read", items: 2, verified: 2, label });
        expect(read.link).toBeNull();
        expect(write).toMatchObject({ kind: "memory_write", detail: "" });
    });

    it("says when memory items read back without their labels, or a write's label was not stored", () => {
        const [one, some, write] = agentSteps(
            [
                memory({ items: 1, verified: 0, trust: "untrusted" }),
                memory({ items: 3, verified: 1 }),
                memory({ op: "write", items: 1, verified: 0 }),
            ],
            [],
        );
        expect(one).toMatchObject({ detail: "1 of 1 item unmatched · read as untrusted", influenced: true });
        expect(some.detail).toBe("2 of 3 items unmatched · read as untrusted");
        expect(agentSteps([memory({ items: 1, verified: 1 })], [])[0].detail).toBe("Read 1 item");
        expect(write.detail).toBe("Label not stored · reads back as untrusted");
    });
});

describe("edgesOf", () => {
    it("lists every link between two agents in step order, leaving out other steps and self links", () => {
        const steps = agentSteps(
            [message({ verified: false, from: "unknown" }), handoff(), memory(), handoff({ to: "triage" })],
            [],
        );
        expect(edgesOf(steps)).toEqual([
            {
                stepId: "e".repeat(16),
                kind: "message",
                from: "unknown",
                to: "billing",
                at: BASE + 4000,
                channel: null,
                carries: [{ origin: "agent:unknown", trust: "trusted", sensitivity: "internal" }],
                untrusted: true,
                summary: "Unverified · read as untrusted",
            },
            {
                stepId: "f".repeat(16),
                kind: "handoff",
                from: "triage",
                to: "refunds",
                at: BASE + 5000,
                channel: "in-process",
                carries: [{ origin: "agent:triage", trust: "trusted", sensitivity: "public" }],
                untrusted: false,
                summary: "",
            },
        ]);
    });
});
