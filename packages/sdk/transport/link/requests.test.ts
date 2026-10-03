import type { CountMessage, LookupMessage, RunCountMessage } from "@quard/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeLink } from "../../test/fake-socket.ts";
import { createRequests } from "./requests.ts";

const count = (id: string): CountMessage => ({
    type: "count",
    id,
    tool: "payInvoice",
    counter: "calls",
    day: "2026-10-03",
    add: 1,
    max: 5,
});
const ID = "1".repeat(16);
const lookup = (id: string): LookupMessage => ({
    type: "lookup",
    id,
    target: { kind: "message", ref: "a".repeat(16) },
});
const runCount = (id: string, counter = "steps"): RunCountMessage => ({
    type: "run_count",
    id,
    runId: "b".repeat(32),
    counter,
    add: 1,
});

function setup() {
    const { fake, link } = fakeLink();
    return { fake, link, requests: createRequests(link) };
}

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("requests to control", () => {
    it("matches the answer by id, and holds the process while it waits", async () => {
        const { fake, requests } = setup();
        const socket = fake.connect();

        const reply = requests.request(count(ID), { ms: 5000 });
        expect(socket.sent.at(-1)).toEqual(count(ID));
        expect(socket.held).toBe(true);
        socket.reply({ type: "counted", id: "2".repeat(16), ok: true, used: 9 });
        socket.reply({ type: "counted", id: ID, ok: true, used: 3 });

        expect(await reply).toEqual({ type: "counted", id: ID, ok: true, used: 3 });
        expect(socket.held).toBe(false);
    });

    it("matches the answer to a run count the same way", async () => {
        const { fake, requests } = setup();
        const socket = fake.connect();
        const runCount: RunCountMessage = {
            type: "run_count",
            id: ID,
            runId: "d".repeat(32),
            counter: "steps",
            add: 1,
        };

        const reply = requests.request(runCount, { ms: 5000 });
        expect(socket.sent.at(-1)).toEqual(runCount);
        socket.reply({ type: "counted", id: ID, ok: true, used: 12 });

        expect(await reply).toEqual({ type: "counted", id: ID, ok: true, used: 12 });
    });

    it("answers undefined at once when control is away", async () => {
        const { fake, requests } = setup();

        expect(await requests.request(count(ID), { ms: 5000 })).toBeUndefined();
        expect(fake.last().sent).toEqual([]);
    });

    it("gives up after the wait, then passes a late answer on", async () => {
        const { fake, requests } = setup();
        const socket = fake.connect();
        const late = vi.fn();

        const reply = requests.request(count(ID), { ms: 5000, late });
        vi.advanceTimersByTime(5000);

        expect(await reply).toBeUndefined();
        expect(socket.held).toBe(false);
        socket.reply({ type: "counted", id: ID, ok: false, used: 5 });
        socket.reply({ type: "counted", id: ID, ok: true, used: 6 });
        expect(late.mock.calls).toEqual([[{ type: "counted", id: ID, ok: false, used: 5 }]]);
    });

    it("forgets a request with no use for a late answer", async () => {
        const { fake, requests } = setup();
        const socket = fake.connect();

        const reply = requests.request(count(ID), { ms: 5000 });
        vi.advanceTimersByTime(5000);
        expect(await reply).toBeUndefined();

        expect(() => socket.reply({ type: "counted", id: ID, ok: true, used: 1 })).not.toThrow();
    });

    it("answers undefined for an error about the request", async () => {
        const { fake, requests } = setup();
        const socket = fake.connect();

        const reply = requests.request(count(ID), { ms: 5000 });
        socket.reply({ type: "error", code: "bad_message", message: "nope" });
        socket.reply({ type: "error", code: "failed", message: "database down", id: ID });

        expect(await reply).toBeUndefined();
    });

    it("answers undefined for everything in flight when the link drops", async () => {
        const { fake, requests } = setup();
        const socket = fake.connect();
        const late = vi.fn();
        const lost = requests.request(count("3".repeat(16)), { ms: 1000, late });
        vi.advanceTimersByTime(1000);
        await lost;

        const reply = requests.request(count(ID), { ms: 5000 });
        socket.drop();

        expect(await reply).toBeUndefined();
        expect(late).toHaveBeenCalledWith(undefined);
    });

    it("never holds the process for a message nothing waits on", async () => {
        const { fake, requests } = setup();
        const socket = fake.connect();

        const reply = requests.request(count(ID), { ms: 5000, hold: false });

        expect(socket.held).toBe(false);
        requests.stop();
        expect(await reply).toBeUndefined();
    });

    it("keeps at most 1000 late answers to wait for", async () => {
        const { fake, requests } = setup();
        fake.connect();
        const late = vi.fn();

        const replies = Array.from({ length: 1001 }, (_, n) =>
            requests.request(count(n.toString(16).padStart(16, "0")), { ms: 1000, late }),
        );
        vi.advanceTimersByTime(1000);
        await Promise.all(replies);

        expect(late.mock.calls).toEqual([[undefined]]);
    });

    it("matches label lookups and run counts to their answers", async () => {
        const { fake, requests } = setup();
        const socket = fake.connect();
        const records = { type: "labels" as const, id: ID, records: [] };

        const found = requests.request(lookup(ID), { ms: 5000 });
        const counted = requests.request(runCount("2".repeat(16)), { ms: 5000 });
        socket.reply(records);
        socket.reply({ type: "counted", id: "2".repeat(16), ok: true, used: 4 });

        expect(await found).toEqual(records);
        expect(await counted).toMatchObject({ type: "counted", used: 4 });
        expect(socket.sent.map((message) => message.type)).toEqual(["hello", "lookup", "run_count"]);
    });

    it("waits for the first connect when asked to, and holds the process meanwhile", async () => {
        const { fake, requests } = setup();
        const socket = fake.last();

        const reply = requests.request(lookup(ID), { ms: 5000, waitForStart: true });
        expect(socket.sent).toEqual([]);
        expect(socket.held).toBe(true);
        fake.connect();
        expect(socket.sent.at(-1)).toEqual(lookup(ID));
        socket.reply({ type: "labels", id: ID, records: [] });

        expect(await reply).toEqual({ type: "labels", id: ID, records: [] });
        expect(socket.held).toBe(false);
    });

    it("sends nothing once the wait for the first connect is over", async () => {
        const { fake, requests } = setup();

        const reply = requests.request(lookup(ID), { ms: 5000, waitForStart: true });
        vi.advanceTimersByTime(5000);
        expect(await reply).toBeUndefined();
        const socket = fake.connect();

        expect(socket.sent.map((message) => message.type)).toEqual(["hello"]);
    });

    it("answers at once while control is away after the first connect", async () => {
        const { fake, requests } = setup();
        fake.connect().drop();

        expect(await requests.request(lookup(ID), { ms: 5000, waitForStart: true })).toBeUndefined();
    });

    it("answers undefined when a waiting request can't go out on connect", async () => {
        const { fake, requests } = setup();

        const reply = requests.request(runCount(ID, "x".repeat(1_100_000)), { ms: 5000, waitForStart: true });
        fake.connect();

        expect(await reply).toBeUndefined();
    });
});
