import { Agent, RunContext, RunState, RunToolApprovalItem, StreamedRunResult } from "@openai/agents";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerCall } from "../../context/registry.ts";
import { newScope } from "../../context/scope.ts";
import { resetAll } from "../../test/reset.ts";
import { notePause, noteStream, pausedOf, takePaused } from "./paused.ts";

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
        const paused = { run: newScope().run };

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

type Internal = { _done(): void; _raiseError(error: unknown): void };

function streamOf(state: RunState<unknown, Agent>): StreamedRunResult<never, never> & Internal {
    return new StreamedRunResult({ state: state as never }) as StreamedRunResult<never, never> & Internal;
}

function idle(): RunState<unknown, Agent> {
    return new RunState(new RunContext(), "Send it.", agent, 10);
}

describe("noteStream", () => {
    it("finds a stream's run from a rebuilt state before the stream ends", () => {
        const scope = newScope();
        registerCall({ callId: "call_1", tool: "sendEmail", args: {}, scope, stepId: "s1" });
        const paused = { run: scope.run };

        noteStream(streamOf(idle()), paused);

        expect(pausedOf(stateWith([{ type: "function_call", callId: "call_1" }]))).toBe(paused);
    });

    it("forgets a stream that ends without stopping and finishes its run", () => {
        const state = idle();
        const stream = streamOf(state);
        const finish = vi.fn();
        noteStream(stream, { run: newScope().run }, finish);

        stream._done();

        expect(pausedOf(state)).toBeUndefined();
        expect(finish).toHaveBeenCalledWith(undefined);
    });

    it("finishes a failed stream with its error", async () => {
        const state = idle();
        const stream = streamOf(state);
        const finish = vi.fn();
        noteStream(stream, { run: newScope().run }, finish);
        const error = new Error("model failed");

        stream._raiseError(error);
        await stream.completed.catch(() => undefined);

        expect(pausedOf(state)).toBeUndefined();
        expect(finish).toHaveBeenCalledWith({ error });
    });

    it("leaves the end to the resume once a resume took the run", () => {
        const state = idle();
        const stream = streamOf(state);
        const finish = vi.fn();
        const paused = { run: newScope().run };
        noteStream(stream, paused, finish);

        takePaused(pausedOf(state));
        stream._done();

        expect(pausedOf(state)).toBe(paused);
        expect(finish).not.toHaveBeenCalled();
    });

    it("puts back the pause a stream of the same state replaced", () => {
        const state = idle();
        const earlier = { run: newScope().run };
        notePause({ interruptions: [{}], state }, earlier);
        const stream = streamOf(state);

        noteStream(stream, { run: earlier.run });
        expect(pausedOf(state)).not.toBe(earlier);
        stream._done();

        expect(pausedOf(state)).toBe(earlier);
    });

    it("keeps a later stream's note of the same run", () => {
        const scope = newScope();
        registerCall({ callId: "call_1", tool: "sendEmail", args: {}, scope, stepId: "s1" });
        const first = streamOf(idle());
        const later = { run: scope.run };
        noteStream(first, { run: scope.run });
        noteStream(streamOf(idle()), later);

        first._done();

        expect(pausedOf(stateWith([{ type: "function_call", callId: "call_1" }]))).toBe(later);
    });
});
