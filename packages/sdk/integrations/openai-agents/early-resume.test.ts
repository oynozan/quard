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
    // Resumes with no await before the run
    const resume = (state: State) => mail.runner.run(mail.mail, approve(state), { session });
    const release = () => session?.release();
    return { ...mail, first, resume, release, endedAtResume };
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

function untrustedBlocks(): RunEvent[] {
    return decisionsOf(events).filter(
        (event) => event.guard === "egress" && event.rule === "untrusted-destination" && event.decision === "block",
    );
}

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
