import { CHANNELS, openListener, type Listener, type Notice } from "@quard/db";
import { startTestDb, type TestDb } from "@quard/db/testing";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { wait } from "../test/client.ts";
import { until } from "../test/server.ts";
import { keepListening, type ListenOptions, type OpenListener } from "./listen.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

afterEach(() => {
    vi.useRealTimers();
});

function options(open: OpenListener, fields: Partial<ListenOptions> = {}) {
    const logs: string[] = [];
    const heard: Notice[] = [];
    const back = vi.fn();
    const all: ListenOptions = {
        url: test.url,
        open,
        heard: (notice) => heard.push(notice),
        back,
        timing: { relistenMs: 10, relistenMaxMs: 25 },
        log: (message) => logs.push(message),
        ...fields,
    };
    return { all, logs, heard, back };
}

function fakeListener(close = vi.fn(async () => {})): Listener {
    return { client: {} as Listener["client"], close };
}

describe("keepListening", () => {
    it("hears notifications and opens a new connection after losing one", async () => {
        const opened: Listener[] = [];
        const open: OpenListener = async (url, heard, lost) => {
            const listener = await openListener(url, heard, lost);
            opened.push(listener);
            return listener;
        };
        const { all, logs, heard, back } = options(open);
        const stop = keepListening(all);
        await until(() => back.mock.calls.length === 1);

        opened[0]?.client.emit("notification", { channel: CHANNELS.keys, payload: "key-1" });
        opened[0]?.client.emit("error", new Error("terminated"));
        await until(() => back.mock.calls.length === 2);

        expect(heard).toEqual([{ channel: CHANNELS.keys, payload: "key-1" }]);
        expect(logs).toEqual(["control: lost the Postgres listen connection: terminated"]);
        expect(opened).toHaveLength(2);
        await stop();
    });

    it("waits longer after each failure, up to the cap, and starts over after a connect", async () => {
        vi.useFakeTimers();
        let fail = true;
        let lose: (error: Error) => void = () => {};
        const listener = fakeListener();
        const open = vi.fn<OpenListener>(async (_url, _heard, lost) => {
            if (fail) {
                throw new Error("refused");
            }
            lose = lost;
            return listener;
        });
        const { all, logs, back } = options(open);
        const stop = keepListening(all);

        await vi.advanceTimersByTimeAsync(0);
        expect(open).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(10);
        expect(open).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(19);
        expect(open).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(1);
        expect(open).toHaveBeenCalledTimes(3);
        await vi.advanceTimersByTimeAsync(25);
        expect(open).toHaveBeenCalledTimes(4);
        fail = false;
        await vi.advanceTimersByTimeAsync(25);
        expect(open).toHaveBeenCalledTimes(5);
        expect(back).toHaveBeenCalledTimes(1);

        lose(new Error("gone"));
        await vi.advanceTimersByTimeAsync(10);
        expect(open).toHaveBeenCalledTimes(6);
        expect(listener.close).toHaveBeenCalledTimes(1);
        expect(logs.slice(0, 2)).toEqual([
            "control: could not listen on Postgres: refused",
            "control: could not listen on Postgres: refused",
        ]);
        await stop();
        expect(listener.close).toHaveBeenCalledTimes(2);
    });

    it("closes a connection that opens after it stopped", async () => {
        let resolve: (listener: Listener) => void = () => {};
        const { all, back } = options(() => new Promise<Listener>((done) => (resolve = done)));
        const stop = keepListening(all);
        await stop();
        const listener = fakeListener();

        resolve(listener);

        await until(() => vi.mocked(listener.close).mock.calls.length === 1);
        expect(back).not.toHaveBeenCalled();
    });

    it("does not try again after it stopped", async () => {
        let reject: (error: Error) => void = () => {};
        const open = vi.fn<OpenListener>(() => new Promise<Listener>((_done, fail) => (reject = fail)));
        const stop = keepListening(options(open).all);
        await stop();

        reject(new Error("refused"));
        await wait(40);

        expect(open).toHaveBeenCalledTimes(1);
    });

    it("stops even when the connection fails to close", async () => {
        const listener = fakeListener(vi.fn(async () => Promise.reject(new Error("already gone"))));
        const { all, back } = options(async () => listener);
        const stop = keepListening(all);
        await until(() => back.mock.calls.length === 1);

        await expect(stop()).resolves.toBeUndefined();
    });
});
