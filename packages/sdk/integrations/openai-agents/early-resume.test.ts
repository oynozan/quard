import { MemorySession, type Agent, type AgentInputItem, type RunState, type RunStreamEvent } from "@openai/agents";
import type { RunEvent } from "@quard/shared";
import { AsyncResource } from "node:async_hooks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { quard } from "../../index.ts";
import { decisionsOf } from "../../test/events.ts";
import { mailRun, runIds } from "../../test/mail-run.ts";
import { resetAll } from "../../test/reset.ts";

let events: RunEvent[] = [];

beforeEach(() => {
    events = [];
    quard.configure({ onEvent: (event) => events.push(event) });
});

afterEach(() => {
    resetAll();
});

// A session that holds the save of the paused turn until released, so
// the stream stays open while the app resumes
class HeldSession extends MemorySession {
    release: () => void = () => undefined;
    private readonly held = new Promise<void>((resolve) => (this.release = resolve));
    private holding = true;

    override async addItems(items: AgentInputItem[]): Promise<void> {
        if (this.holding && items.some((item) => item.type === "function_call" && item.name === "sendEmail")) {
            this.holding = false;
            await this.held;
        }
        return super.addItems(items);
    }
}

type State = RunState<undefined, Agent>;

// A streamed mail run, and whether its stream had ended at each resume
async function streamedMail(held: boolean) {
    const mail = mailRun();
    const session = held ? new HeldSession() : undefined;
    const first = await mail.runner.run(mail.mail, "Send the invoice.", { stream: true, session });
    let ended = false;
    void first.completed.then(() => (ended = true));
    const endedAtResume: boolean[] = [];
    const approve = (state: State) => {
        endedAtResume.push(ended);
        state.getInterruptions().forEach((item) => state.approve(item));
        return state;
    };
    // Each resumes with no await before the run
    const resume = (state: State) => mail.runner.run(mail.mail, approve(state), { session });
    const resumeStream = (state: State) => mail.runner.run(mail.mail, approve(state), { session, stream: true });
    const release = () => session?.release();
    return { ...mail, first, resume, resumeStream, release, endedAtResume };
}

type Streamed = Awaited<ReturnType<typeof streamedMail>>;

function asksApproval(event: RunStreamEvent): boolean {
    return event.type === "run_item_stream_event" && event.name === "tool_approval_requested";
}

// Reads the stream up to the approval event and stops reading
async function readToApproval(run: Streamed): Promise<void> {
    for await (const event of run.first) {
        if (asksApproval(event)) {
            break;
        }
    }
}

// The app stops reading on the approval event and resumes at once
async function breakAndResume(run: Streamed): Promise<unknown> {
    await readToApproval(run);
    const second = await run.resume(run.first.state);
    run.release();
    return second.finalOutput;
}

// The app resumes from inside its loop, then reads the stream to its end
async function resumeInLoop(run: Streamed): Promise<unknown> {
    let output: unknown;
    for await (const event of run.first) {
        if (asksApproval(event)) {
            output = (await run.resume(run.first.state)).finalOutput;
            run.release();
        }
    }
    return output;
}

// The app resumes as a stream from inside its loop
async function streamInLoop(run: Streamed): Promise<unknown> {
    let output: unknown;
    for await (const event of run.first) {
        if (asksApproval(event)) {
            const second = await run.resumeStream(run.first.state);
            await second.completed;
            run.release();
            output = second.finalOutput;
        }
    }
    return output;
}

function ofType(type: RunEvent["type"]): RunEvent[] {
    return events.filter((event) => event.type === type);
}

function untrustedBlocks(): RunEvent[] {
    return decisionsOf(events).filter(
        (event) => event.guard === "egress" && event.rule === "untrusted-destination" && event.decision === "block",
    );
}

describe("a streamed run resumed before its stream ends", () => {
    it.each([
        ["after breaking out on the approval event", breakAndResume, false],
        ["from inside the loop body", resumeInLoop, false],
        ["as a stream from inside the loop body", streamInLoop, false],
        ["after breaking out, while the stream is held open", breakAndResume, true],
        ["from inside the loop body, while the stream is held open", resumeInLoop, true],
    ])("goes on in the Quard run it stopped in, %s", async (_when, resumeEarly, held) => {
        const run = await streamedMail(held);

        const output = await resumeEarly(run);
        await run.first.completed;

        if (held) {
            expect(run.endedAtResume).toEqual([false]);
        }
        expect(output).toBe("I did not send it.");
        expect(run.sent).not.toHaveBeenCalled();
        expect(runIds(events).size).toBe(1);
        expect(ofType("run_started")).toHaveLength(1);
        expect(ofType("run_finished")).toHaveLength(1);
        expect(events.at(-1)).toMatchObject({ type: "run_finished", status: "completed" });
        expect(untrustedBlocks()).toHaveLength(1);
    });
});

describe("a streamed run paused inside a quard scope and resumed before its stream ends", () => {
    it.each([
        ["", false],
        [", while the stream is held open", true],
    ])("brings the paused run's labels into the run it resumes in%s", async (_when, held) => {
        // Runs a function in the test's own context, outside any quard scope
        const outside = AsyncResource.bind((fn: () => Promise<unknown>) => fn());
        let second: Promise<unknown> = Promise.resolve();
        const run = await quard.run({ agent: "app" }, async () => {
            const inside = await streamedMail(held);
            await readToApproval(inside);
            second = outside(() => inside.resume(inside.first.state));
            return inside;
        });
        await second;
        run.release();
        await run.first.completed;

        if (held) {
            expect(run.endedAtResume).toEqual([false]);
        }
        expect(run.sent).not.toHaveBeenCalled();
        expect(runIds(events).size).toBe(2);
        expect(untrustedBlocks()).toHaveLength(1);
    });
});
