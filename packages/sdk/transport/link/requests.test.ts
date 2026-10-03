import type { CountMessage } from "@quard/shared";
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
});
