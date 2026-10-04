import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lastSource, stubEventSource, FakeEventSource } from "../../../test/live/event-source";
import { FRESH_MS, IDLE_REFRESH_MS, LIVE_URL, LiveUpdates, REFRESH_GAP_MS, REOPEN_MS } from "./live-updates";
import { useLiveStatus } from "./status";

const nav = vi.hoisted(() => ({ router: { refresh: vi.fn() }, pathname: "/" }));
vi.mock("next/navigation", () => ({ useRouter: () => nav.router, usePathname: () => nav.pathname }));

const RUN = "a".repeat(32);
const OTHER = "b".repeat(32);

function Status() {
    return <p>{useLiveStatus()}</p>;
}

const tree = () => (
    <LiveUpdates>
        <Status />
    </LiveUpdates>
);

const show = () => render(tree());
const status = () => screen.getByRole("paragraph").textContent;
const change = (data: string) => act(() => lastSource().emit("change", data));
const ready = () => act(() => lastSource().emit("ready", "{}"));
const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));
const refreshes = () => nav.router.refresh.mock.calls.length;

// A shown page whose stream is up, with nothing refreshed yet
function showLive() {
    const view = show();
    ready();
    return view;
}

let visibility: DocumentVisibilityState = "visible";
function setVisibility(next: DocumentVisibilityState) {
    visibility = next;
    act(() => document.dispatchEvent(new Event("visibilitychange")));
}

const health = vi.fn(async () => new Response(null, { status: 204 }));
const loadedFor = vi.fn(() => 0);

beforeEach(() => {
    vi.useFakeTimers();
    stubEventSource();
    nav.pathname = "/";
    visibility = "visible";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
    vi.spyOn(performance, "now").mockImplementation(loadedFor);
    loadedFor.mockReturnValue(0);
    health.mockClear().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", health);
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    nav.router.refresh.mockReset();
});

describe("LiveUpdates", () => {
    it("opens one stream and refreshes the page on a change", () => {
        showLive();
        expect(FakeEventSource.all.map((source) => source.url)).toEqual([LIVE_URL]);
        expect(refreshes()).toBe(0);
        change('{"topic":"approvals"}');
        expect(refreshes()).toBe(1);
    });

    it("skips data that is not a change", () => {
        showLive();
        change("not json");
        expect(refreshes()).toBe(0);
    });

    it("refreshes a run page only for its own run", () => {
        nav.pathname = `/runs/${RUN}`;
        showLive();
        change(`{"topic":"runs","runs":["${OTHER}"]}`);
        expect(refreshes()).toBe(0);
        change(`{"topic":"runs","runs":["${OTHER}","${RUN}"]}`);
        expect(refreshes()).toBe(1);
    });

    it("follows the page after a navigation without opening a new stream", () => {
        const view = showLive();
        nav.pathname = `/runs/${RUN}`;
        view.rerender(tree());
        change(`{"topic":"runs","runs":["${OTHER}"]}`);
        expect(refreshes()).toBe(0);
        expect(FakeEventSource.all).toHaveLength(1);
    });

    it("refreshes at most once per gap, with one refresh after a burst", () => {
        showLive();
        change('{"topic":"fleet"}');
        change('{"topic":"fleet"}');
        change('{"topic":"runs"}');
        expect(refreshes()).toBe(1);
        wait(REFRESH_GAP_MS - 1);
        expect(refreshes()).toBe(1);
        wait(1);
        expect(refreshes()).toBe(2);
        wait(REFRESH_GAP_MS * 3);
        expect(refreshes()).toBe(2);
        change('{"topic":"fleet"}');
        expect(refreshes()).toBe(3);
    });

    it("waits for a running refresh, then does one more", async () => {
        let done!: () => void;
        nav.router.refresh.mockImplementationOnce(() => new Promise<void>((resolve) => (done = resolve)));
        showLive();
        change('{"topic":"fleet"}');
        wait(REFRESH_GAP_MS * 2);
        change('{"topic":"fleet"}');
        change('{"topic":"fleet"}');
        expect(refreshes()).toBe(1);

        await act(async () => done());
        expect(refreshes()).toBe(2);
    });

    it("drops a refresh that waited on a running one when the stream goes down", async () => {
        let done!: () => void;
        nav.router.refresh.mockImplementationOnce(() => new Promise<void>((resolve) => (done = resolve)));
        showLive();
        change('{"topic":"fleet"}');
        wait(REFRESH_GAP_MS);
        change('{"topic":"fleet"}');
        act(() => lastSource().fail());

        await act(async () => done());
        expect(refreshes()).toBe(1);
    });

    it("refreshes a page nothing refreshed for a while", () => {
        showLive();
        wait(IDLE_REFRESH_MS - 1);
        expect(refreshes()).toBe(0);
        wait(1);
        expect(refreshes()).toBe(1);
        wait(IDLE_REFRESH_MS);
        expect(refreshes()).toBe(2);
    });

    it("refreshes on the first ready when the page loaded a while before", () => {
        loadedFor.mockReturnValue(FRESH_MS);
        showLive();
        expect(refreshes()).toBe(1);
    });

    it("is live once the stream is ready and offline while it is down", () => {
        show();
        expect(status()).toBe("connecting");
        act(() => lastSource().open());
        expect(status()).toBe("connecting");
        ready();
        expect(status()).toBe("live");
        act(() => lastSource().fail());
        expect(status()).toBe("offline");
        ready();
        expect(status()).toBe("live");
    });

    it("refreshes once when the stream comes back, for changes it missed", () => {
        showLive();
        act(() => lastSource().fail());
        expect(refreshes()).toBe(0);
        ready();
        expect(refreshes()).toBe(1);
    });

    it("never refreshes while the stream is down", () => {
        showLive();
        change('{"topic":"fleet"}');
        change('{"topic":"fleet"}');
        act(() => lastSource().fail());
        wait(IDLE_REFRESH_MS * 2);
        expect(refreshes()).toBe(1);
    });

    it("closes the stream while the tab is hidden and catches up when it is shown", () => {
        showLive();
        const first = lastSource();
        change('{"topic":"fleet"}');
        change('{"topic":"fleet"}');
        setVisibility("hidden");
        expect(first.close).toHaveBeenCalled();
        wait(IDLE_REFRESH_MS * 2);
        expect(refreshes()).toBe(1);

        setVisibility("visible");
        expect(FakeEventSource.all).toHaveLength(2);
        ready();
        expect(refreshes()).toBe(2);
    });

    it("opens no stream for a tab that loads hidden, until it is shown", () => {
        visibility = "hidden";
        show();
        expect(FakeEventSource.all).toHaveLength(0);
        setVisibility("visible");
        expect(FakeEventSource.all).toHaveLength(1);
        setVisibility("visible");
        expect(FakeEventSource.all).toHaveLength(1);
    });

    it("opens a new stream a while after the server refused one, and refreshes so a lost session signs in", async () => {
        showLive();
        await act(async () => lastSource().fail(true));
        expect(health).toHaveBeenCalledTimes(1);
        expect(refreshes()).toBe(1);
        expect(FakeEventSource.all).toHaveLength(1);

        setVisibility("visible");
        expect(FakeEventSource.all).toHaveLength(1);
        wait(REOPEN_MS);
        expect(FakeEventSource.all).toHaveLength(2);

        // Refused again before it was ready: no second check
        await act(async () => lastSource().fail(true));
        expect(health).toHaveBeenCalledTimes(1);
        wait(REOPEN_MS);
        ready();
        expect(status()).toBe("live");
        await act(async () => lastSource().fail(true));
        expect(health).toHaveBeenCalledTimes(2);
    });

    it("does not refresh after a refusal while the server does not answer", async () => {
        health.mockResolvedValueOnce(new Response(null, { status: 502 }));
        show();
        await act(async () => lastSource().fail(true));
        expect(health).toHaveBeenCalledTimes(1);
        expect(refreshes()).toBe(0);
    });

    it("closes the stream when it unmounts", () => {
        const { unmount } = showLive();
        unmount();
        expect(lastSource().close).toHaveBeenCalled();
    });

    it("stops its timers and checks when it unmounts", async () => {
        let answer!: (response: Response) => void;
        health.mockImplementationOnce(() => new Promise<Response>((resolve) => (answer = resolve)));
        const { unmount } = showLive();
        change('{"topic":"fleet"}');
        change('{"topic":"fleet"}');
        act(() => lastSource().fail(true));
        unmount();

        await act(async () => answer(new Response(null, { status: 204 })));
        vi.advanceTimersByTime(IDLE_REFRESH_MS);
        expect(FakeEventSource.all).toHaveLength(1);
        expect(refreshes()).toBe(1);
        visibility = "hidden";
        document.dispatchEvent(new Event("visibilitychange"));
        visibility = "visible";
        document.dispatchEvent(new Event("visibilitychange"));
        expect(FakeEventSource.all).toHaveLength(1);
    });
});
