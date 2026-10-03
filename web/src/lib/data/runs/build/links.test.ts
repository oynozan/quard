// @vitest-environment node
import { describe, expect, it } from "vitest";
import { newState } from "../../../../../test/data-runs-build/state";
import { labelFor, USER_LABEL } from "../../labels/origins";
import { delegateTo, memoryStep, sendMessage } from "./links";

const IBAN = "GB33BUKB20201555555555";
const PAGE = labelFor("web:supplier-portal.example");
const ORCHESTRATOR = { origin: "agent:orchestrator", trust: "trusted", sensitivity: "internal" };

describe("delegateTo", () => {
    it("sends a guarded delegate call, then a delegation step under it", () => {
        const s = newState();
        const { call, link } = delegateTo(s, "orchestrator", "researcher", {
            text: "Find the invoice portal",
            values: [{ value: "INV-20931" }],
        });
        expect(call).toMatchObject({ kind: "tool_call", name: "delegate", status: "ok" });
        expect(call.args.map((arg) => [arg.name, arg.value])).toEqual([
            ["to", "researcher"],
            ["brief", "Find the invoice portal"],
        ]);
        expect(link).toMatchObject({
            kind: "handoff",
            name: "orchestrator to researcher",
            parentId: call.id,
            detail: "Find the invoice portal",
        });
        // Nothing read yet, so the sender passes on its own agent label.
        expect(link!.link).toEqual({
            kind: "delegation",
            from: "orchestrator",
            to: "researcher",
            channel: "in-process",
            carries: [ORCHESTRATOR],
            labelRef: expect.stringMatching(/^lr_[0-9a-f]{12}$/),
            untrusted: false,
            summary: "Find the invoice portal",
        });
        expect(s.parents.get("researcher")).toBe("orchestrator");
        expect(s.parents.get("orchestrator")).toBeNull();
        expect(s.session.get("researcher")).toBe(link!.id);
        expect(s.readBy("researcher")).toEqual([ORCHESTRATOR]);
        expect(s.index.map((v) => [v.raw, v.stepId, v.label.origin])).toEqual([
            ["INV-20931", link!.id, "agent:orchestrator"],
        ]);
    });

    it("tells the limit check the depth and fan-out of the new helper", () => {
        const s = newState();
        delegateTo(s, "orchestrator", "researcher", { text: "one" });
        delegateTo(s, "orchestrator", "billing", { text: "two" });
        delegateTo(s, "billing", "support", { text: "three" });
        const limits = s.steps.filter((step) => step.name === "run-limits").map((step) => step.detail);
        expect(limits).toEqual([
            "Depth 1 of 3 · fan-out 1 of 10",
            "Depth 1 of 3 · fan-out 2 of 10",
            "Depth 2 of 3 · fan-out 1 of 10",
        ]);
        // An agent keeps its first parent.
        delegateTo(s, "researcher", "billing", { text: "four" });
        expect(s.parents.get("billing")).toBe("orchestrator");
    });

    it("marks an untrusted handoff on another channel, and the delegate call before it", () => {
        const s = newState();
        s.see("researcher", [PAGE]);
        const { call, link } = delegateTo(
            s,
            "researcher",
            "billing",
            { text: `Pay ${IBAN}` },
            { kind: "handoff", channel: "http", mark: "carry", markCall: "turning" },
        );
        expect(link!.link).toMatchObject({ kind: "handoff", channel: "http", carries: [PAGE], untrusted: true });
        expect(link!.detail).not.toContain(IBAN);
        expect(s.readBy("billing")).toEqual([PAGE]);
        expect(s.marks).toEqual([
            { role: "turning", stepId: call.id },
            { role: "carry", stepId: link!.id },
        ]);
    });

    it("stops after five handoffs back and forth between the same pair", () => {
        const s = newState();
        const results = [];
        for (let i = 0; i < 5; i++) {
            const [from, to] = i % 2 === 0 ? ["billing", "support"] : ["support", "billing"];
            results.push(delegateTo(s, from, to, { text: `round ${i}` }, { mark: "carry" }));
        }
        expect(results.map((r) => r.link === null)).toEqual([false, false, false, false, true]);
        const last = results[4];
        expect(last.call.status).toBe("blocked");
        expect(s.handoffs.get("billing>support")).toBe(5);
        expect(s.marks).toHaveLength(4);
    });

    it("lets a script force the limit decision", () => {
        const s = newState();
        const { call, link } = delegateTo(
            s,
            "orchestrator",
            "researcher",
            { text: "go" },
            { decide: { "run-limits": { outcome: "block", mode: "block" } } },
        );
        expect(call.status).toBe("blocked");
        expect(link).toBeNull();
    });
});

describe("sendMessage", () => {
    it("sends a reply under the sender's last step without starting a session", () => {
        const s = newState();
        s.see("researcher", [USER_LABEL, PAGE]);
        s.lastModel.set("researcher", "model-step");
        const step = sendMessage(s, "researcher", "orchestrator", { text: "Found it" }, "carry");
        expect(step).toMatchObject({ kind: "message", name: "researcher to orchestrator", parentId: "model-step" });
        expect(step.link).toMatchObject({ kind: "message", channel: "in-process", untrusted: true });
        expect(step.link!.carries).toEqual([USER_LABEL, PAGE]);
        expect(s.session.has("orchestrator")).toBe(false);
        expect(s.readBy("orchestrator")).toEqual([USER_LABEL, PAGE]);
        expect(s.marks).toEqual([{ role: "carry", stepId: step.id }]);
    });

    it("sends a message without a mark", () => {
        const s = newState();
        const step = sendMessage(s, "billing", "support", { text: "done" });
        expect(step.parentId).toBeNull();
        expect(s.marks).toEqual([]);
    });
});

describe("memoryStep", () => {
    it("writes with the agent's current context and reads nothing back", () => {
        const s = newState();
        s.see("billing", [PAGE]);
        const step = memoryStep(s, "billing", "write", "notes", "supplier", { values: [{ value: IBAN }] });
        expect(step.kind).toBe("memory_write");
        expect(step.memory).toEqual({
            store: "notes",
            key: "supplier",
            label: { origin: PAGE.origin, trust: "untrusted", sensitivity: "public" },
            hashOk: true,
        });
        expect(step.detail).toBe("Wrote notes/supplier");
        expect(s.index).toEqual([]);
    });

    it("reads with the memory label by default and lets the agent see it", () => {
        const s = newState();
        s.lastModel.set("billing", "model-step");
        const step = memoryStep(s, "billing", "read", "notes", "supplier");
        expect(step).toMatchObject({ kind: "memory_read", name: "notes", parentId: "model-step" });
        expect(step.memory!.label).toEqual(labelFor("memory:notes"));
        expect(step.detail).toBe("Read notes/supplier");
        expect(s.readBy("billing")).toEqual([labelFor("memory:notes")]);
    });

    it("reads back the label stored with the content when its hash still matches", () => {
        const s = newState();
        const step = memoryStep(s, "billing", "read", "notes", "supplier", {
            label: USER_LABEL,
            values: [{ value: "INV-20931" }],
            summary: `Supplier pays to ${IBAN}`,
        });
        expect(step.memory!.label).toEqual(USER_LABEL);
        expect(step.detail.startsWith("Supplier pays to ")).toBe(true);
        expect(step.detail).not.toContain(IBAN);
        expect(s.index.map((v) => [v.raw, v.label])).toEqual([["INV-20931", USER_LABEL]]);
    });

    it("drops the stored label when the content changed outside the wrapper", () => {
        const s = newState();
        const step = memoryStep(s, "billing", "read", "notes", "supplier", { label: USER_LABEL, hashOk: false });
        expect(step.memory).toMatchObject({ label: labelFor("memory:notes"), hashOk: false });
        expect(step.detail).toBe("Read notes/supplier. Changed outside the wrapper, so it reads back as untrusted");
    });
});
