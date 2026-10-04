import { Agent, RunContext, RunState, RunToolApprovalItem } from "@openai/agents";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerCall } from "../../context/registry.ts";
import { newScope } from "../../context/scope.ts";
import { resetAll } from "../../test/reset.ts";
import { notePause, pausedOf } from "./paused.ts";

afterEach(() => {
    resetAll();
});

const agent = new Agent({ name: "mail" });

// A state whose interruptions hold these raw items
function stateWith(rawItems: object[]): RunState<unknown, Agent> {
    const state = new RunState(new RunContext(), "Send it.", agent, 10);
    const items = rawItems.map((raw) => new RunToolApprovalItem(raw as never, agent));
    vi.spyOn(state, "getInterruptions").mockReturnValue(items);
    return state;
}

describe("notePause", () => {
    it("notes only a result with interruptions and a state", () => {
        const scope = newScope();
        const paused = { root: scope, frame: scope };

        expect(notePause("done", paused)).toBe(false);
        expect(notePause({ interruptions: [], state: {} }, paused)).toBe(false);
        expect(notePause({ interruptions: [{}] }, paused)).toBe(false);
    });
});

describe("pausedOf", () => {
    it("finds nothing for input that is not a state, or a state from elsewhere", () => {
        registerCall({ callId: "call_1", tool: "sendEmail", args: {}, scope: newScope(), stepId: "s1" });

        expect(pausedOf("Send it.")).toBeUndefined();
        expect(pausedOf(stateWith([{ type: "hosted_tool_call", name: "x" }]))).toBeUndefined();
        expect(pausedOf(stateWith([{ type: "function_call", callId: "call_9" }]))).toBeUndefined();
        expect(pausedOf(stateWith([{ type: "function_call", callId: "call_1" }]))).toBeUndefined();
    });
});
