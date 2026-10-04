import type { AskMessage } from "@quard/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forgetProjectKey } from "../../core/project-key.ts";
import { fakeLink, sentOf } from "../../test/fake-socket.ts";
import { PROJECT_KEY } from "../../test/hash-key.ts";
import { createApprovals, type Ask } from "./approvals.ts";

const REQUEST = `apr_${"1".repeat(16)}`;
const GRANT = `grt_${"2".repeat(16)}`;

function ask(askId: string): AskMessage {
    return {
        type: "ask",
        askId,
        runId: "a".repeat(32),
        stepId: "b".repeat(16),
        agent: "billing",
        tool: "payInvoice",
        argsHash: "d".repeat(32),
        args: { amount: 4950 },
        labels: [],
        context: { trust: "trusted", sensitivity: "internal", origins: [], flagged: false },
        reasons: [{ guard: "approval", rule: "approval", reason: "approval_required" }],
    };
}

// The ask as the approval pipeline hands it over, built when sent
function pending(askId: string): Ask {
    return { askId, message: () => ask(askId) };
}

const A = "a".repeat(16);
const B = "b".repeat(16);

function setup() {
    const { fake, link } = fakeLink();
    return { fake, link, approvals: createApprovals(link, 30_000, 15_000) };
}

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    forgetProjectKey();
    vi.useRealTimers();
});

describe("approvals through control", () => {
    it("asks, keeps the process alive while it waits, and settles on the answer", async () => {
        const { fake, approvals } = setup();
        const socket = fake.connect();

        const answer = approvals.ask(pending(A), undefined);
        expect(sentOf(socket, "ask")).toEqual([ask(A)]);
        expect(socket.held).toBe(true);
        socket.reply({ type: "asked", askId: A, requestId: REQUEST });
        socket.reply({ type: "decided", askId: A, answer: "once", requestId: REQUEST });

        expect(await answer).toEqual({ kind: "decided", answer: "once", requestId: REQUEST, grantId: undefined });
        expect(socket.held).toBe(false);
    });

    it("keeps the request id from asked when the answer leaves it out", async () => {
        const { fake, approvals } = setup();
        const socket = fake.connect();

        const answer = approvals.ask(pending(A), undefined);
        socket.reply({ type: "asked", askId: A, requestId: REQUEST });
        socket.reply({ type: "decided", askId: A, answer: "always", grantId: GRANT });

        expect(await answer).toEqual({ kind: "decided", answer: "always", requestId: REQUEST, grantId: GRANT });
    });

    it("beats for every waiting call on one timer", async () => {
        const { fake, approvals } = setup();
        const socket = fake.connect();

        const first = approvals.ask(pending(A), undefined);
        const second = approvals.ask(pending(B), undefined);
        socket.reply({ type: "asked", askId: A, requestId: REQUEST });
        socket.reply({ type: "asked", askId: B, requestId: REQUEST });
        vi.advanceTimersByTime(15_000);
        socket.reply({ type: "decided", askId: A, answer: "deny" });
        await first;
        vi.advanceTimersByTime(15_000);
        socket.reply({ type: "decided", askId: B, answer: "deny" });
        await second;
        vi.advanceTimersByTime(15_000);

        expect(sentOf(socket, "beat")).toEqual([
            { type: "beat", askIds: [A, B] },
            { type: "beat", askIds: [B] },
        ]);
    });

    it("stops waiting after the timeout and tells control", async () => {
        const { fake, approvals } = setup();
        const socket = fake.connect();

        const answer = approvals.ask(pending(A), 5000);
        socket.reply({ type: "asked", askId: A, requestId: REQUEST });
        vi.advanceTimersByTime(5000);

        expect(await answer).toEqual({ kind: "timeout", requestId: REQUEST });
        expect(sentOf(socket, "cancel")).toEqual([{ type: "cancel", askId: A }]);
    });

    it("stops waiting when the call is aborted and tells control", async () => {
        const { fake, approvals } = setup();
        const socket = fake.connect();
        const controller = new AbortController();

        const answer = approvals.ask(pending(A), undefined, controller.signal);
        socket.reply({ type: "asked", askId: A, requestId: REQUEST });
        controller.abort();

        expect(await answer).toEqual({ kind: "aborted", requestId: REQUEST });
        expect(sentOf(socket, "cancel")).toEqual([{ type: "cancel", askId: A }]);
        expect(socket.held).toBe(false);
    });

    it("forgets the signal once the answer comes", async () => {
        const { fake, approvals } = setup();
        const socket = fake.connect();
        const controller = new AbortController();

        const answer = approvals.ask(pending(A), undefined, controller.signal);
        socket.reply({ type: "decided", askId: A, answer: "deny", requestId: REQUEST });
        await answer;
        controller.abort();

        expect(sentOf(socket, "cancel")).toEqual([]);
    });

    it("waits up to 30 s for control before it asks", async () => {
        const { fake, approvals } = setup();

        const answer = approvals.ask(pending(A), undefined);
        vi.advanceTimersByTime(29_000);
        const socket = fake.connect();
        socket.reply({ type: "decided", askId: A, answer: "once", requestId: REQUEST });

        expect(sentOf(socket, "ask")).toEqual([ask(A)]);
        expect((await answer).kind).toBe("decided");
    });

    it("gives up when control can't be reached for 30 s", async () => {
        const { approvals } = setup();

        const answer = approvals.ask(pending(A), undefined);
        vi.advanceTimersByTime(30_000);

        expect(await answer).toEqual({ kind: "down" });
    });

    it("asks again after a reconnect, with the same ask id and the request id it knows", async () => {
        const { fake, approvals } = setup();
        const socket = fake.connect();
        const answer = approvals.ask(pending(A), undefined);
        socket.reply({ type: "asked", askId: A, requestId: REQUEST });

        socket.drop();
        vi.advanceTimersByTime(20_000);
        const again = fake.connect();
        again.reply({ type: "asked", askId: A, requestId: REQUEST });
        vi.advanceTimersByTime(20_000);
        again.reply({ type: "decided", askId: A, answer: "once" });

        expect(sentOf(again, "ask")).toEqual([{ ...ask(A), requestId: REQUEST }]);
        expect(await answer).toMatchObject({ kind: "decided", requestId: REQUEST });
    });

    it("gives up when control never takes an ask sent on a live link", async () => {
        const { fake, approvals } = setup();
        fake.connect();

        const answer = approvals.ask(pending(A), undefined);
        vi.advanceTimersByTime(30_000);

        expect(await Promise.race([answer, Promise.resolve("still waiting")])).toEqual({ kind: "down" });
    });

    it("gives up when control never takes the ask again after a reconnect", async () => {
        const { fake, approvals } = setup();
        const socket = fake.connect();
        const answer = approvals.ask(pending(A), undefined);
        socket.reply({ type: "asked", askId: A, requestId: REQUEST });

        socket.drop();
        vi.advanceTimersByTime(1000);
        fake.connect();
        vi.advanceTimersByTime(29_000);

        expect(await Promise.race([answer, Promise.resolve("still waiting")])).toEqual({ kind: "down" });
    });

    it("gives up when the link stays down for 30 s while it waits", async () => {
        const { fake, approvals } = setup();
        const answer = approvals.ask(pending(A), undefined);
        fake.connect().drop();

        vi.advanceTimersByTime(30_000);

        expect(await answer).toEqual({ kind: "down" });
        vi.advanceTimersByTime(15_000);
        expect(fake.sockets.flatMap((socket) => sentOf(socket, "beat"))).toEqual([]);
    });

    it("asks again each second while control fails to take the ask, then waits with no limit", async () => {
        const { fake, approvals } = setup();
        const socket = fake.connect();

        const answer = approvals.ask(pending(A), undefined);
        socket.reply({ type: "error", code: "server_error", message: "database down" });
        socket.reply({ type: "error", code: "server_error", message: "database down", id: A });
        vi.advanceTimersByTime(1000);
        socket.reply({ type: "asked", askId: A, requestId: REQUEST });
        vi.advanceTimersByTime(60_000);
        socket.reply({ type: "decided", askId: A, answer: "once" });

        expect(sentOf(socket, "ask")).toEqual([ask(A), ask(A)]);
        expect(await answer).toMatchObject({ kind: "decided", requestId: REQUEST });
    });

    it("gives up when control fails to take the ask for 30 s", async () => {
        const { fake, approvals } = setup();
        const socket = fake.connect();

        const answer = approvals.ask(pending(A), undefined);
        for (let second = 0; second < 30; second += 1) {
            socket.reply({ type: "error", code: "server_error", message: "database down", id: A });
            vi.advanceTimersByTime(1000);
        }

        expect(await answer).toEqual({ kind: "down" });
        expect(sentOf(socket, "ask")).toHaveLength(30);
    });

    it("asks again only once the link is back when it drops after control failed", async () => {
        const { fake, approvals } = setup();
        const socket = fake.connect();

        const answer = approvals.ask(pending(A), undefined);
        socket.reply({ type: "error", code: "server_error", message: "database down", id: A });
        socket.drop();
        vi.advanceTimersByTime(1000);
        const again = fake.connect();
        again.reply({ type: "decided", askId: A, answer: "deny" });

        expect(sentOf(socket, "ask")).toEqual([ask(A)]);
        expect(sentOf(again, "ask")).toEqual([ask(A)]);
        expect(await answer).toMatchObject({ kind: "decided", answer: "deny" });
    });

    it("ignores answers for calls that no longer wait", () => {
        const { fake } = setup();
        const socket = fake.connect();

        expect(() => {
            socket.reply({ type: "asked", askId: A, requestId: REQUEST });
            socket.reply({ type: "decided", askId: A, answer: "once" });
            socket.reply({ type: "error", code: "failed", message: "x", id: A });
        }).not.toThrow();
    });

    it("settles every waiting call when it stops", async () => {
        const { fake, approvals } = setup();
        fake.connect();

        const answers = Promise.all([approvals.ask(pending(A), 60_000), approvals.ask(pending(B), undefined)]);
        approvals.stop();

        expect(await answers).toEqual([{ kind: "down" }, { kind: "down" }]);
    });

    it("builds each ask with the project's key from control's ready message", async () => {
        const { fake, approvals } = setup();
        const message = vi.fn((_key: Buffer) => ask(A));

        const answer = approvals.ask({ askId: A, message }, undefined);
        const socket = fake.connect();
        socket.reply({ type: "decided", askId: A, answer: "once" });

        expect(message.mock.calls).toEqual([[PROJECT_KEY]]);
        expect(await answer).toMatchObject({ kind: "decided" });
    });

    it("sends no ask while the key is unknown, and gives up like a link that is down", async () => {
        const { fake, approvals } = setup();
        const socket = fake.connect();
        forgetProjectKey();

        const answer = approvals.ask(pending(A), undefined);
        vi.advanceTimersByTime(30_000);

        expect(sentOf(socket, "ask")).toEqual([]);
        expect(await answer).toEqual({ kind: "down" });
    });
});
