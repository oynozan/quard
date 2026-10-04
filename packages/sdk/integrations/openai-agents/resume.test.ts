import { RunState, type Agent } from "@openai/agents";
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

type State = RunState<undefined, Agent>;

async function approveAll(agent: Agent, state: State, rebuild: boolean): Promise<State> {
    const resumed = rebuild ? await RunState.fromString<undefined, Agent>(agent, state.toString()) : state;
    resumed.getInterruptions().forEach((item) => resumed.approve(item));
    return resumed;
}

describe("a run resumed after the SDK's needsApproval", () => {
    it.each([
        ["the same state", false],
        ["a state rebuilt from a string", true],
    ])("goes on in the Quard run it stopped in, from %s", async (_from, rebuild) => {
        const { mail, sent, runner } = mailRun();

        const first = await runner.run(mail, "Send the invoice.");
        expect(first.interruptions).toHaveLength(1);
        expect(events.map((event) => event.type)).not.toContain("run_finished");
        const before = [...events];
        const second = await runner.run(mail, await approveAll(mail, first.state, rebuild));

        expect(second.finalOutput).toBe("I did not send it.");
        expect(sent).not.toHaveBeenCalled();
        const later = events.slice(before.length);
        expect(later.map((event) => event.type)).not.toContain("run_started");
        expect(runIds(events).size).toBe(1);
        const egress = decisionsOf(later).filter((event) => event.guard === "egress");
        expect(egress).toContainEqual(expect.objectContaining({ rule: "untrusted-destination", decision: "block" }));
    });
});

async function drain(stream: AsyncIterable<unknown>): Promise<void> {
    for await (const _event of stream) {
        // Reads the stream to its end
    }
}

describe("a streamed run resumed as soon as it completes", () => {
    it.each([
        ["after awaiting completed", false, true],
        ["after reading the stream, then awaiting completed", true, true],
        ["after reading the stream only", true, false],
    ])("goes on in the Quard run it stopped in, %s", async (_when, read, awaited) => {
        const { mail, sent, runner } = mailRun();

        const first = await runner.run(mail, "Send the invoice.", { stream: true });
        if (read) {
            await drain(first);
        }
        if (awaited) {
            await first.completed;
        }
        // No await between the end of the stream and the resume
        first.state.getInterruptions().forEach((item) => first.state.approve(item));
        const second = await runner.run(mail, first.state);

        expect(second.finalOutput).toBe("I did not send it.");
        expect(sent).not.toHaveBeenCalled();
        expect(runIds(events).size).toBe(1);
        expect(events.filter((event) => event.type === "run_started")).toHaveLength(1);
        expect(events.at(-1)).toMatchObject({ type: "run_finished" });
        const egress = decisionsOf(events).filter((event) => event.guard === "egress");
        expect(egress).toContainEqual(expect.objectContaining({ rule: "untrusted-destination", decision: "block" }));
    });
});

describe("a paused run's state resumed somewhere else", () => {
    function untrustedBlocks(list: readonly RunEvent[]) {
        return decisionsOf(list).filter(
            (event) => event.rule === "untrusted-destination" && event.decision === "block",
        );
    }

    it("brings the paused run's labels into the quard scope it resumes in", async () => {
        const { mail, sent, runner } = mailRun();
        const first = await runner.run(mail, "Send the invoice.");

        const state = await approveAll(mail, first.state, false);
        await quard.run({ agent: "app" }, () => runner.run(mail, state));

        expect(sent).not.toHaveBeenCalled();
        expect(runIds(events).size).toBe(2);
        expect(untrustedBlocks(events)).toHaveLength(1);
    });

    it("brings the labels of a run paused inside a quard scope into the run it resumes in", async () => {
        const { mail, sent, runner } = mailRun();
        const first = await quard.run({ agent: "app" }, () => runner.run(mail, "Send the invoice."));

        await runner.run(mail, await approveAll(mail, first.state, false));

        expect(sent).not.toHaveBeenCalled();
        expect(runIds(events).size).toBe(2);
        expect(untrustedBlocks(events)).toHaveLength(1);
    });

    it("brings the labels of a streamed run paused inside a quard scope", async () => {
        const { mail, sent, runner } = mailRun();
        const first = await quard.run({ agent: "app" }, async () => {
            const streamed = await runner.run(mail, "Send the invoice.", { stream: true });
            await streamed.completed;
            return streamed;
        });

        first.state.getInterruptions().forEach((item) => first.state.approve(item));
        await runner.run(mail, first.state);

        expect(sent).not.toHaveBeenCalled();
        expect(untrustedBlocks(events)).toHaveLength(1);
    });

    it("brings the labels into a new run when the state resumes a second time", async () => {
        const { mail, sent, runner } = mailRun(2);
        const first = await runner.run(mail, "Send the invoice.");
        const saved = first.state.toString();
        await runner.run(mail, await approveAll(mail, first.state, false));

        const again = await approveAll(mail, await RunState.fromString<undefined, Agent>(mail, saved), false);
        await runner.run(mail, again);

        expect(sent).not.toHaveBeenCalled();
        expect(runIds(events).size).toBe(2);
        expect(untrustedBlocks(events)).toHaveLength(2);
    });
});
