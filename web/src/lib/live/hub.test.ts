// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHANNELS, type Notice } from "@quard/db";

type Opened = { heard: (notice: Notice) => void; lost: (error: Error) => void; close: ReturnType<typeof vi.fn> };

const mocks = vi.hoisted(() => ({ opened: [] as Opened[], fail: 0 }));
const openListener = vi.hoisted(() =>
    vi.fn(async (_url: string, heard: Opened["heard"], lost: Opened["lost"]) => {
        if (mocks.fail > 0) {
            mocks.fail -= 1;
            throw new Error("down");
        }
        const close = vi.fn(async () => {});
        mocks.opened.push({ heard, lost, close });
        return { client: {}, close };
    }),
);
vi.mock("@quard/db", async (original) => ({ ...(await original<object>()), openListener }));

const { BACKOFF, createHub, liveHub } = await import("./hub");

const P = "project-1";
const fleet = (payload: string): Notice => ({ channel: CHANNELS.fleet, payload });
const flush = () => vi.advanceTimersByTimeAsync(0);

// A stream as the hub sees it, with spies for what the hub tells it
function sub(project: string | undefined = P) {
    return { project, send: vi.fn(), ready: vi.fn(), end: vi.fn() };
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("DATABASE_URL", "postgres://db");
    mocks.opened = [];
    mocks.fail = 0;
    openListener.mockClear();
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
});

describe("createHub", () => {
    it("opens one listener on first use and sends each subscriber its changes", async () => {
        const hub = createHub();
        expect(openListener).not.toHaveBeenCalled();
        const mine = sub();
        const other = sub("project-2");
        const leaveMine = hub.subscribe(mine);
        const leaveOther = hub.subscribe(other);
        await flush();
        hub.subscribe(sub());

        expect(openListener).toHaveBeenCalledTimes(1);
        expect(openListener.mock.calls[0][0]).toBe("postgres://db");
        mocks.opened[0].heard(fleet(P));
        expect(mine.send).toHaveBeenCalledWith({ topic: "fleet" });
        expect(other.send).not.toHaveBeenCalled();

        leaveMine();
        leaveOther();
        expect(mocks.opened[0].close).not.toHaveBeenCalled();
    });

    it("says ready only once the listener hears", async () => {
        const hub = createHub();
        const first = sub();
        hub.subscribe(first);
        expect(first.ready).not.toHaveBeenCalled();
        await flush();
        expect(first.ready).toHaveBeenCalledTimes(1);

        const later = sub();
        hub.subscribe(later);
        expect(later.ready).toHaveBeenCalledTimes(1);
        expect(first.ready).toHaveBeenCalledTimes(1);
    });

    it("ends every stream when the listener is lost, and opens a new one for the next", async () => {
        const hub = createHub();
        const one = sub();
        const two = sub();
        const leaveOne = hub.subscribe(one);
        hub.subscribe(two);
        await flush();

        mocks.opened[0].lost(new Error("lost"));
        expect(one.end).toHaveBeenCalledTimes(1);
        expect(two.end).toHaveBeenCalledTimes(1);
        leaveOne();
        mocks.opened[0].heard(fleet(P));
        expect(one.send).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(10_000);
        expect(openListener).toHaveBeenCalledTimes(1);

        const next = sub();
        hub.subscribe(next);
        await flush();
        expect(openListener).toHaveBeenCalledTimes(2);
        expect(next.ready).toHaveBeenCalledTimes(1);
    });

    it("closes the listener when the last subscriber leaves, once", async () => {
        const hub = createHub();
        const leave = hub.subscribe(sub());
        await flush();
        leave();
        leave();
        expect(mocks.opened[0].close).toHaveBeenCalledTimes(1);

        hub.subscribe(sub());
        await flush();
        expect(openListener).toHaveBeenCalledTimes(2);
    });

    it("ignores a failed close", async () => {
        const hub = createHub();
        const leave = hub.subscribe(sub());
        await flush();
        mocks.opened[0].close.mockRejectedValueOnce(new Error("gone"));
        leave();
        await flush();
        expect(mocks.opened[0].close).toHaveBeenCalled();
    });

    it("tries again after a growing wait while the listener fails to open", async () => {
        const hub = createHub();
        mocks.fail = 4;
        const waiting = sub();
        hub.subscribe(waiting);
        await flush();
        expect(openListener).toHaveBeenCalledTimes(1);

        const waits = [...BACKOFF, BACKOFF[2]];
        for (const [i, wait] of waits.entries()) {
            await vi.advanceTimersByTimeAsync(wait - 1);
            expect(openListener).toHaveBeenCalledTimes(1 + i);
            hub.subscribe(sub());
            await vi.advanceTimersByTimeAsync(1);
            expect(openListener).toHaveBeenCalledTimes(2 + i);
        }
        expect(mocks.opened).toHaveLength(1);
        expect(waiting.ready).toHaveBeenCalledTimes(1);

        // A good open starts the waits over
        mocks.opened[0].lost(new Error("lost"));
        mocks.fail = 1;
        hub.subscribe(sub());
        await flush();
        await vi.advanceTimersByTimeAsync(BACKOFF[0]);
        expect(mocks.opened).toHaveLength(2);
    });

    it("stops trying when everyone leaves during the wait", async () => {
        const hub = createHub();
        mocks.fail = 1;
        const leave = hub.subscribe(sub());
        await flush();
        leave();
        await vi.advanceTimersByTimeAsync(10_000);
        expect(openListener).toHaveBeenCalledTimes(1);
    });

    it("does not try again after a failure that comes after everyone left", async () => {
        const hub = createHub();
        mocks.fail = 1;
        hub.subscribe(sub())();
        await vi.advanceTimersByTimeAsync(10_000);
        expect(openListener).toHaveBeenCalledTimes(1);
    });

    it("closes a listener that opens after everyone left", async () => {
        const hub = createHub();
        const gone = sub();
        hub.subscribe(gone)();
        await flush();
        expect(mocks.opened[0].close).toHaveBeenCalledTimes(1);
        expect(gone.ready).not.toHaveBeenCalled();
    });

    it("ignores a failed close of a listener nobody needs", async () => {
        openListener.mockImplementationOnce(async (_url, heard, lost) => {
            const close = vi.fn(async () => Promise.reject(new Error("gone")));
            mocks.opened.push({ heard, lost, close });
            return { client: {}, close } as never;
        });
        const hub = createHub();
        hub.subscribe(sub())();
        await flush();
        expect(mocks.opened[0].close).toHaveBeenCalledTimes(1);
    });

    it("tries again while DATABASE_URL is missing", async () => {
        vi.stubEnv("DATABASE_URL", "");
        const hub = createHub();
        hub.subscribe(sub());
        await flush();
        expect(openListener).not.toHaveBeenCalled();

        vi.stubEnv("DATABASE_URL", "postgres://db");
        await vi.advanceTimersByTimeAsync(BACKOFF[0]);
        expect(openListener).toHaveBeenCalledTimes(1);
    });
});

describe("liveHub", () => {
    it("keeps one hub per process on globalThis", () => {
        expect(liveHub()).toBe(liveHub());
        expect((globalThis as { quardLiveHub?: unknown }).quardLiveHub).toBe(liveHub());
    });
});
