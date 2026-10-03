import { parseHashKey } from "@quard/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { takeEvents } from "../../core/recorder.ts";
import type { FailResult } from "../../guards/call.ts";
import { makeAskableCall } from "../../test/call.ts";
import { decisionsOf } from "../../test/events.ts";
import { fakeSockets, sentOf } from "../../test/fake-socket.ts";
import { resetAll } from "../../test/reset.ts";
import { createControl, type Control } from "../../transport/link/control.ts";
import { askControl } from "./remote.ts";

const REQUEST = `apr_${"1".repeat(16)}`;
const GRANT = `grt_${"2".repeat(16)}`;
const ASKS: FailResult[] = [
    { guard: "approval", rule: "approval", decision: "ask", mode: "block", reason: "approval_required" },
];

let control: Control | undefined;

function setup() {
    const fake = fakeSockets();
    control = createControl({ url: "ws://c", key: "k", hashKey: parseHashKey("ab".repeat(32)), open: fake.open });
    return { fake, control };
}

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    control?.stop();
    resetAll();
    vi.useRealTimers();
});

// Starts an ask and answers it the way control would
async function answered(reply: (askId: string) => object, ms?: number) {
    const { fake, control } = setup();
    const socket = fake.connect();
    const call = makeAskableCall({ amount: 4950 });
    const result = askControl(control, call, ASKS, ms);
    const [ask] = sentOf(socket, "ask");
    socket.reply({ type: "asked", askId: ask?.askId as string, requestId: REQUEST });
    socket.reply(reply(ask?.askId as string) as never);
    return { result: await result, decisions: decisionsOf(takeEvents()) };
}

describe("askControl", () => {
    it("approves on a human's approve once, and records the request", async () => {
        const { result, decisions } = await answered((askId) => ({ type: "decided", askId, answer: "once" }));

        expect(result).toBe("approved");
        expect(decisions).toMatchObject([{ guard: "approval", rule: "human", decision: "allow", request: REQUEST }]);
    });

    it("tells an always-approve grant apart from a human's answer", async () => {
        const human = await answered((askId) => ({ type: "decided", askId, answer: "always", requestId: REQUEST }));
        const grant = await answered((askId) => ({ type: "decided", askId, answer: "always", grantId: GRANT }));

        expect([human.result, grant.result]).toEqual(["approved", "approved"]);
        expect(human.decisions[0]?.rule).toBe("human");
        expect(grant.decisions[0]?.rule).toBe("always-approved");
    });

    it("refuses a denied call", async () => {
        const { result, decisions } = await answered((askId) => ({ type: "decided", askId, answer: "deny" }));

        expect(result).toMatchObject({ guard: "approval", rule: "human", reason: "approval_denied" });
        expect(decisions[0]).toMatchObject({ decision: "block", reason: "approval_denied", request: REQUEST });
    });

    it("refuses when no one answers before the timeout", async () => {
        const { fake, control } = setup();
        fake.connect();

        const result = askControl(control, makeAskableCall({ amount: 1 }), ASKS, 1000);
        vi.advanceTimersByTime(1000);

        expect(await result).toMatchObject({ rule: "timeout", reason: "approval_timed_out" });
    });

    it("refuses when control can't be reached in time", async () => {
        const { control } = setup();

        const result = askControl(control, makeAskableCall({ amount: 1 }), ASKS, undefined);
        vi.advanceTimersByTime(30_000);

        expect(await result).toMatchObject({ rule: "backend-down", reason: "backend_unavailable" });
    });

    it("refuses an ask control would not accept", async () => {
        const { control } = setup();
        const call = { ...makeAskableCall({ amount: 1 }), agent: "" };

        expect(await askControl(control, call, ASKS, undefined)).toMatchObject({
            rule: "unsendable",
            reason: "approval_unavailable",
        });
    });

    it("refuses without asking when the arguments are too deep to show", async () => {
        const { fake, control } = setup();
        const socket = fake.connect();
        let deep: unknown = 1;
        for (let level = 0; level < 40; level++) {
            deep = [deep];
        }

        expect(await askControl(control, makeAskableCall(deep), ASKS, undefined)).toMatchObject({
            rule: "too-deep-to-show",
            reason: "approval_unavailable",
        });
        expect(sentOf(socket, "ask")).toEqual([]);
    });
});
