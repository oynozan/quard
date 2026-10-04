import { MemorySession, type AgentInputItem } from "@openai/agents";
import type { RunEvent } from "@quard/shared";
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

// A session that fails once, as it saves the paused sendEmail call
class FailingSession extends MemorySession {
    private failed = false;

    override async addItems(items: AgentInputItem[]): Promise<void> {
        if (!this.failed && items.some((item) => item.type === "function_call" && item.name === "sendEmail")) {
            this.failed = true;
            throw new Error("session down");
        }
        return super.addItems(items);
    }
}

function ofType(type: RunEvent["type"]): RunEvent[] {
    return events.filter((event) => event.type === type);
}

function untrustedBlocks(): RunEvent[] {
    return decisionsOf(events).filter(
        (event) => event.guard === "egress" && event.rule === "untrusted-destination" && event.decision === "block",
    );
}

describe("a streamed run that pauses, then fails as it saves the pause", () => {
    it("goes on in the Quard run it stopped in when its state is resumed", async () => {
        const { mail, sent, runner } = mailRun();
        const session = new FailingSession();
        const first = await runner.run(mail, "Send the invoice.", { stream: true, session });
        await expect(first.completed).rejects.toThrow("session down");
        expect(first.interruptions).toHaveLength(1);

        first.state.getInterruptions().forEach((item) => first.state.approve(item));
        const second = await runner.run(mail, first.state, { session });

        expect(second.finalOutput).toBe("I did not send it.");
        expect(sent).not.toHaveBeenCalled();
        expect(runIds(events).size).toBe(1);
        expect(ofType("run_started")).toHaveLength(1);
        expect(untrustedBlocks()).toHaveLength(1);
        expect(ofType("run_finished")).toMatchObject([
            { status: "failed", error: "session down" },
            { status: "completed" },
        ]);
        expect(events.at(-1)).toMatchObject({ type: "run_finished", status: "completed" });
    });
});

describe("a streamed run paused inside a quard scope, then failed as it saves the pause", () => {
    it("brings the paused run's labels into the run that resumes its state", async () => {
        const { mail, sent, runner } = mailRun();
        const session = new FailingSession();
        const first = await quard.run({ agent: "app" }, async () => {
            const streamed = await runner.run(mail, "Send the invoice.", { stream: true, session });
            await streamed.completed.catch(() => undefined);
            return streamed;
        });

        first.state.getInterruptions().forEach((item) => first.state.approve(item));
        await runner.run(mail, first.state, { session });

        expect(sent).not.toHaveBeenCalled();
        expect(runIds(events).size).toBe(2);
        expect(untrustedBlocks()).toHaveLength(1);
    });
});
