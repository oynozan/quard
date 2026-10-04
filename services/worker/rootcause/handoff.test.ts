import type { AgentMessageRecord } from "@quard/db";
import { describe, expect, it } from "vitest";
import { at, attackRun, changeStep, IBAN_KEY, label, OTHER_IBAN_KEY, step, STEP } from "../test/runs.ts";
import type { StoredRun } from "./run.ts";
import { findVerdict } from "./verdict.ts";

// The step where billing took a message in
const RECEIVE = "dddddddddddddddd";

function message(change: Partial<AgentMessageRecord> & Pick<AgentMessageRecord, "from" | "at">): AgentMessageRecord {
    const plain = { stepId: RECEIVE, kind: "handoff", to: "billing", parentStepId: null } as const;
    return { ...plain, trust: "trusted", sensitivity: "internal", verified: true, ...change };
}

// The attack run where researcher read the web page and billing paid
function handedOff(messages: AgentMessageRecord[]): StoredRun {
    const run = changeStep(attackRun(), STEP.fetch, { agent: "researcher" });
    const labels = run.labels.map((item) => (item.contentId === "c2" ? { ...item, agent: "researcher" } : item));
    return { ...run, labels, messages };
}

// The attack run with only trusted content: these labels, these messages
function trustedRun(labels: StoredRun["labels"], messages: AgentMessageRecord[], run = attackRun()): StoredRun {
    return { ...run, labels, messages };
}

const supplier = label({ contentId: "c4", stepId: STEP.fetch, origin: "tool:getSupplier", keys: [IBAN_KEY] });

describe("findVerdict across agents", () => {
    it("names the handoff that carried untrusted content, and keeps it bad input", () => {
        const verdict = findVerdict(handedOff([message({ from: "researcher", at: at(58) })]), STEP.pay);

        expect(verdict).toMatchObject({ category: "bad input", handoffFault: null, entry: { agent: "researcher" } });
        expect(verdict?.acrossAgents).toEqual({
            entryAgent: "researcher",
            handoff: {
                stepId: RECEIVE,
                kind: "handoff",
                from: "researcher",
                to: "billing",
                at: at(58).toISOString(),
                trust: "trusted",
                verified: true,
            },
            turningAgent: "billing",
            damageAgent: "billing",
        });
    });

    it("names the agents with no handoff when none reached the damage agent in time", () => {
        const late = [message({ from: "researcher", at: at(60) }), message({ from: "billing", at: at(50) })];

        expect(findVerdict(handedOff(late), STEP.pay)?.acrossAgents).toEqual({
            entryAgent: "researcher",
            handoff: null,
            turningAgent: "billing",
            damageAgent: "billing",
        });
    });

    it("takes the latest handoff from the entry agent or one it reached, else the latest", () => {
        const chain = [
            message({ kind: "message", from: "researcher", to: "planner", at: at(40) }),
            message({ from: "planner", at: at(50) }),
            message({ from: "auditor", at: at(59) }),
        ];

        expect(findVerdict(handedOff(chain), STEP.pay)?.acrossAgents?.handoff).toMatchObject({ from: "planner" });
        expect(findVerdict(handedOff(chain.slice(1)), STEP.pay)?.acrossAgents?.handoff).toMatchObject({
            from: "auditor",
            at: at(59).toISOString(),
        });
    });

    it("blames the sender when the value first came in a message", () => {
        const sent = label({
            contentId: "c5",
            stepId: RECEIVE,
            origin: "agent:researcher",
            keys: [IBAN_KEY],
            at: at(58),
        });
        const run = trustedRun([sent], [message({ kind: "message", from: "researcher", at: at(58) })]);

        expect(findVerdict(run, STEP.pay)).toMatchObject({
            category: "bad handoff",
            handoffFault: "wrong information sent",
            entry: { contentId: "c5", agent: "billing", origin: "agent:researcher" },
            acrossAgents: { entryAgent: "billing", handoff: { kind: "message", from: "researcher" } },
        });
    });

    it("counts content a receive guard labeled as the message, whatever its origin", () => {
        const sent = label({ contentId: "c5", stepId: RECEIVE, origin: "mcp:queue", keys: [IBAN_KEY], at: at(58) });
        const run = trustedRun([sent], [message({ kind: "message", from: "researcher", at: at(58) })]);

        expect(findVerdict(run, STEP.pay)?.handoffFault).toBe("wrong information sent");
    });

    it.each([
        ["no record vouched for", { verified: false }],
        ["carried untrusted context", { trust: "untrusted" as const }],
    ])("blames the sender of a handoff that %s", (_what, change) => {
        const run = trustedRun([supplier], [message({ from: "researcher", at: at(50), ...change })]);

        expect(findVerdict(run, STEP.pay)).toMatchObject({
            category: "bad handoff",
            handoffFault: "wrong information sent",
        });
    });

    it("blames the receiver when it made the value up after a sound handoff, before a failed tool", () => {
        const failed = step({ stepId: "aaaaaaaaaaaaaaaa", kind: "tool_call", name: "getSupplier", status: "error" });
        const base = changeStep(attackRun(), STEP.pay, { detail: { keys: [OTHER_IBAN_KEY] } });
        const run = trustedRun([], [message({ from: "researcher", at: at(50) })], {
            ...base,
            steps: [failed, ...base.steps],
        });

        expect(findVerdict(run, STEP.pay)).toMatchObject({
            category: "bad handoff",
            handoffFault: "correct message misread",
            entry: { stepId: STEP.decide, origin: "agent:billing", contentId: null },
        });
    });

    it("leaves the handoff out of it when the value came from the receiver's own trusted content", () => {
        const own = label({ ...supplier, origin: "agent:billing" });
        const verdict = findVerdict(trustedRun([own], [message({ from: "researcher", at: at(50) })]), STEP.pay);

        expect(verdict).toMatchObject({
            category: "bad reasoning",
            handoffFault: null,
            acrossAgents: { entryAgent: "billing", handoff: { from: "researcher" } },
        });
    });
});
