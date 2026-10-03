import { labelFor } from "@quard/shared";
import { afterEach, describe, expect, it } from "vitest";
import { takeEvents } from "../../core/recorder.ts";
import { newScope, type Scope } from "../../context/scope.ts";
import { resetAll } from "../../test/reset.ts";
import { handOff, isFrame, toolFrame, topFrame } from "./frames.ts";

afterEach(() => {
    resetAll();
});

function scope(agent: string): Scope {
    const made = newScope({ agent, tools: ["fetchPage", "payInvoice"] });
    takeEvents();
    return made;
}

function handoffs() {
    return takeEvents().filter((event) => event.type === "handoff");
}

describe("topFrame", () => {
    it("copies the scope with the framework's agent, so the scope stays as it was", () => {
        const parent = scope("app");
        parent.lastStepId = "00f067aa0ba902b7";

        const frame = topFrame(parent, "orchestrator");
        handOff(frame, "billing");

        expect(isFrame(frame)).toBe(true);
        expect(isFrame(parent)).toBe(false);
        expect(parent).toMatchObject({ agent: "app", lastStepId: "00f067aa0ba902b7", depth: 0 });
        expect(frame.run).toBe(parent.run);
    });
});

describe("handOff", () => {
    it("records the handoff and starts the new agent below the step that handed over", () => {
        const frame = topFrame(scope("orchestrator"), "orchestrator");
        frame.lastStepId = "00f067aa0ba902b7";
        frame.run.index.add("Invoice 114 from a web page", labelFor("web:evil-pay.com", {}), "00f067aa0ba902b7");

        handOff(frame, "billing");

        expect(handoffs()).toEqual([
            expect.objectContaining({
                type: "handoff",
                runId: frame.run.runId,
                stepId: "00f067aa0ba902b7",
                agent: "orchestrator",
                to: "billing",
                via: "handoff",
                trust: "untrusted",
                sensitivity: "public",
            }),
        ]);
        expect(frame).toMatchObject({
            agent: "billing",
            parentStepId: "00f067aa0ba902b7",
            lastStepId: undefined,
            depth: 1,
        });
        expect([...(frame.tools ?? [])]).toEqual(["fetchPage", "payInvoice"]);
    });

    it("gives the handoff a step of its own when the agent has none yet", () => {
        const frame = topFrame(scope("orchestrator"), "orchestrator");

        handOff(frame, "billing");

        const [event] = handoffs();
        expect(event?.stepId).toMatch(/^[0-9a-f]{16}$/);
        expect(frame.parentStepId).toBe(event?.stepId);
    });
});

describe("toolFrame", () => {
    it("runs the agent in a frame of its own and records the call as a handoff via a tool", () => {
        const parent = topFrame(scope("orchestrator"), "orchestrator");
        parent.lastStepId = "00f067aa0ba902b7";

        const frame = toolFrame(parent, "researcher");

        expect(isFrame(frame)).toBe(true);
        expect(frame).toMatchObject({ agent: "researcher", parentStepId: "00f067aa0ba902b7", depth: 1 });
        expect(parent.agent).toBe("orchestrator");
        expect(handoffs()).toEqual([
            expect.objectContaining({ agent: "orchestrator", to: "researcher", via: "tool", trust: "trusted" }),
        ]);
    });
});
