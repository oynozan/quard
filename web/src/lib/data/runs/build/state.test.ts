// @vitest-environment node
import { describe, expect, it } from "vitest";
import { newState, RUN_ID, scriptedRng, START } from "../../../../../test/data-runs-build/state";
import { EMPTY_CONTEXT } from "../../labels/context";
import { labelFor, USER_LABEL } from "../../labels/origins";

const WEB = labelFor("web:supplier-portal.example");

describe("BuildState ids and clock", () => {
    it("starts the clock at the run start and keeps the run id", () => {
        const s = newState();
        expect(s.clock).toBe(START);
        expect(s.runId).toBe(RUN_ID);
        expect(s.ending).toBeNull();
    });

    it("hands out 16-hex ids and draws again when an id is already taken", () => {
        const s = newState(START, scriptedRng([...Array(32).fill(0), 0.5]));
        expect(s.newId()).toBe("0".repeat(16));
        expect(s.newId()).toBe("8".repeat(16));
    });

    it("moves the clock forward by rounded waits and ignores negative ones", () => {
        const s = newState();
        s.wait(10.6);
        expect(s.clock).toBe(START + 11);
        s.wait(-500);
        expect(s.clock).toBe(START + 11);
    });

    it("jumps forward to a fixed time but never back", () => {
        const s = newState();
        s.jump(START + 5000);
        expect(s.clock).toBe(START + 5000);
        s.jump(START);
        expect(s.clock).toBe(START + 5000);
    });

    it("draws whole numbers and decimals inside the given range", () => {
        const s = newState();
        for (let i = 0; i < 20; i++) {
            const n = s.int(3, 5);
            expect(Number.isInteger(n)).toBe(true);
            expect(n).toBeGreaterThanOrEqual(3);
            expect(n).toBeLessThanOrEqual(5);
            const f = s.float(0.1, 0.2);
            expect(f).toBeGreaterThanOrEqual(0.1);
            expect(f).toBeLessThan(0.2);
        }
    });
});

describe("BuildState labels and values", () => {
    it("reads nothing at first, so the context is the empty instructions label", () => {
        const s = newState();
        expect(s.readBy("billing")).toEqual([]);
        expect(s.context("billing")).toEqual(EMPTY_CONTEXT);
    });

    it("keeps each origin once and turns untrusted once web content is read", () => {
        const s = newState();
        s.see("billing", [USER_LABEL]);
        s.see("billing", [USER_LABEL, WEB]);
        expect(s.readBy("billing")).toEqual([USER_LABEL, WEB]);
        expect(s.context("billing")).toEqual({
            origin: WEB.origin,
            trust: "untrusted",
            sensitivity: "internal",
        });
        expect(s.readBy("support")).toEqual([]);
    });

    it("indexes values at the current clock unless a time is given, and traces them back", () => {
        const s = newState();
        s.wait(100);
        s.remember([{ value: "https://supplier-portal.example/pay" }], WEB, "step-a", "billing");
        s.remember([{ value: "INV-20931", kind: "id" }], USER_LABEL, "step-b", "billing", START);
        expect(s.index.map((v) => [v.stepId, v.kind, v.at])).toEqual([
            ["step-a", "url", START + 100],
            ["step-b", "id", START],
        ]);
        const traced = s.trace("https://supplier-portal.example/pay");
        expect(traced.generated).toBe(false);
        expect(traced.appearances[0].stepId).toBe("step-a");
        expect(s.trace("INV-20931", "id").appearances[0].label).toEqual(USER_LABEL);
    });
});

describe("BuildState steps", () => {
    it("adds a step at the clock with empty fields and the agent's context", () => {
        const s = newState();
        s.see("billing", [WEB]);
        const step = s.step("billing", "tool_call", "pay_invoice", "parent", 12.4);
        expect(step).toMatchObject({
            parentId: "parent",
            agent: "billing",
            kind: "tool_call",
            name: "pay_invoice",
            startedAt: START,
            durationMs: 12,
            status: "ok",
            context: WEB,
            influenced: true,
            detail: "",
            args: [],
            output: null,
            approval: null,
            hosted: false,
            error: null,
        });
        expect(step.id).toMatch(/^[0-9a-f]{16}$/);
        expect(s.steps).toEqual([step]);
    });

    it("places a step at a given time and never gives it a negative duration", () => {
        const s = newState();
        const step = s.step("billing", "model_call", "m", null, -4, START + 900);
        expect(step.startedAt).toBe(START + 900);
        expect(step.durationMs).toBe(0);
        expect(step.influenced).toBe(false);
    });

    it("records marks in order", () => {
        const s = newState();
        s.mark("entry", "a");
        s.mark("damage", "b");
        expect(s.marks).toEqual([
            { role: "entry", stepId: "a" },
            { role: "damage", stepId: "b" },
        ]);
    });
});

describe("BuildState agent tree and counters", () => {
    it("counts depth from the root and children per agent", () => {
        const s = newState();
        s.parents.set("orchestrator", null);
        s.parents.set("researcher", "orchestrator");
        s.parents.set("billing", "orchestrator");
        s.parents.set("helper", "researcher");
        expect(s.depthOf("orchestrator")).toBe(0);
        expect(s.depthOf("helper")).toBe(2);
        expect(s.depthOf("stranger")).toBe(0);
        expect(s.childrenOf("orchestrator")).toBe(2);
        expect(s.childrenOf("helper")).toBe(0);
    });

    it("stops counting depth at 20 when agents delegate in a circle", () => {
        const s = newState();
        s.parents.set("a", "b");
        s.parents.set("b", "a");
        expect(s.depthOf("a")).toBe(20);
    });

    it("counts each call of a tool and returns the new count", () => {
        const s = newState();
        expect(s.countCall("send_email")).toBe(1);
        expect(s.countCall("send_email")).toBe(2);
        expect(s.countCall("post_slack")).toBe(1);
    });

    it("hangs new calls under the last model call, else the session start, else nothing", () => {
        const s = newState();
        expect(s.parentFor("billing")).toBeNull();
        s.session.set("billing", null);
        expect(s.parentFor("billing")).toBeNull();
        s.session.set("billing", "handoff");
        expect(s.parentFor("billing")).toBe("handoff");
        s.lastModel.set("billing", "model");
        expect(s.parentFor("billing")).toBe("model");
    });
});
