import { afterEach, describe, expect, it, vi } from "vitest";
import { configure } from "../core/config.ts";
import { currentScope, runScope } from "../context/scope.ts";
import { markShared } from "../guards/limit/run-counts.ts";
import { fakeResponses } from "../test/fake-responses.ts";
import { fakeSockets, sentOf, type FakeSocket } from "../test/fake-socket.ts";
import { resetAll } from "../test/reset.ts";
import { countRun } from "../test/run-counts.ts";
import { setActiveControl } from "../transport/link/active.ts";
import { createControl, type Control } from "../transport/link/control.ts";
import { createMonitorFetch } from "./fetch.ts";

const URL_RESPONSES = "https://api.openai.com/v1/responses";
const post = (body: object): RequestInit => ({ method: "POST", body: JSON.stringify(body) });
// 1M fresh input tokens of gpt-5.4-mini cost $0.75
const USAGE = { input_tokens: 1_000_000, output_tokens: 0 };

let control: Control | undefined;

afterEach(() => {
    control?.stop();
    control = undefined;
    resetAll();
});

function linked(): FakeSocket {
    const fake = fakeSockets();
    control = createControl({ url: "ws://c", key: "k", open: fake.open });
    setActiveControl(control);
    return fake.connect();
}

// Answers each run count the way control would, from one shared total per counter
function answerCounts(socket: FakeSocket, totals: Map<string, number>): void {
    const answered = new Set<string>();
    const answer = () => {
        for (const count of sentOf(socket, "run_count")) {
            if (answered.has(count.id)) {
                continue;
            }
            answered.add(count.id);
            socket.reply(countRun(totals, count));
        }
    };
    const send = socket.send.bind(socket);
    socket.send = (text) => {
        send(text);
        queueMicrotask(answer);
    };
}

describe("model calls of a run that spans processes", () => {
    it("count steps and cost through control, and stop at control's step total", async () => {
        configure({ runLimits: { mode: "block", steps: 3 } });
        const socket = linked();
        // Another process already took two steps in this run
        const totals = new Map([["steps", 2]]);
        answerCounts(socket, totals);
        const fake = fakeResponses(() => ({ text: "ok", usage: USAGE }));
        const monitored = createMonitorFetch(fake.fetch);

        const refused = await runScope({ agent: "billing" }, async () => {
            markShared(currentScope()!.run);
            await monitored(URL_RESPONSES, post({ model: "gpt-5.4-mini", input: "one" }));
            await vi.waitFor(() => expect(totals.get("cost")).toBe(0.75));
            const response = await monitored(URL_RESPONSES, post({ model: "gpt-5.4-mini", input: "two" }));
            expect(currentScope()?.run).toMatchObject({ modelCalls: 3, costUsd: 0.75 });
            return response;
        });

        expect(refused.status).toBe(403);
        expect(fake.bodies).toHaveLength(1);
        expect(
            sentOf(socket, "run_count").flatMap(({ counts }) =>
                counts.map(({ counter, add, max }) => [counter, add, max]),
            ),
        ).toEqual([
            ["steps", 1, 3],
            ["cost", 0, undefined],
            ["cost", 0.75, undefined],
            ["steps", 1, 3],
            ["cost", 0, undefined],
        ]);
    });

    it("leave the step count of a run that is not shared in this process", async () => {
        const socket = linked();
        const monitored = createMonitorFetch(fakeResponses(() => ({ text: "ok", usage: USAGE })).fetch);

        await runScope({}, async () => {
            await monitored(URL_RESPONSES, post({ model: "gpt-5.4-mini", input: "one" }));

            expect(currentScope()?.run).toMatchObject({ modelCalls: 1, costUsd: 0.75 });
        });
        expect(sentOf(socket, "run_count")).toEqual([]);
    });
});
