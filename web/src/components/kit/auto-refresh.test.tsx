import { act, render } from "@testing-library/react";
import { Suspense, use, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutoRefresh, HEALTH_URL } from "./auto-refresh";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

let visibility: DocumentVisibilityState = "visible";
const health = vi.fn<() => Promise<Response>>();

function setVisibility(state: DocumentVisibilityState) {
    visibility = state;
    act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
    });
}

// Moves the clock and lets the health check settle
async function tick(ms: number) {
    await act(async () => vi.advanceTimersByTime(ms));
}

beforeEach(() => {
    vi.useFakeTimers();
    visibility = "visible";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
    health.mockImplementation(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", health);
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    router.refresh.mockReset();
});

describe("AutoRefresh", () => {
    it("checks the server, then reloads the page's data every 5 seconds, and renders nothing", async () => {
        const { container } = render(<AutoRefresh />);
        expect(container.innerHTML).toBe("");
        await tick(4999);
        expect(router.refresh).not.toHaveBeenCalled();
        await tick(1);
        expect(health).toHaveBeenCalledWith(HEALTH_URL, { cache: "no-store" });
        expect(router.refresh).toHaveBeenCalledTimes(1);
        await tick(5000);
        await tick(5000);
        expect(router.refresh).toHaveBeenCalledTimes(3);
    });

    it("skips a tick when the server does not answer or fails", async () => {
        render(<AutoRefresh everyMs={1000} />);
        health.mockRejectedValueOnce(new TypeError("Failed to fetch"));
        await tick(1000);
        health.mockResolvedValueOnce(new Response(null, { status: 503 }));
        await tick(1000);
        expect(router.refresh).not.toHaveBeenCalled();

        // A session that ran out still refreshes, so the page can send the person to sign in
        health.mockResolvedValueOnce(new Response(null, { status: 401 }));
        await tick(1000);
        expect(router.refresh).toHaveBeenCalledTimes(1);
    });

    it("starts no second check while one is still out", async () => {
        let answer!: (response: Response) => void;
        health.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
        render(<AutoRefresh everyMs={1000} />);
        await tick(3000);
        expect(health).toHaveBeenCalledTimes(1);

        await act(async () => answer(new Response(null, { status: 204 })));
        expect(router.refresh).toHaveBeenCalledTimes(1);
        await tick(1000);
        expect(health).toHaveBeenCalledTimes(2);
    });

    it("skips a tick while the last refresh is still loading", async () => {
        // The refresh suspends the page until the server data arrives, as Next does
        let arrive!: () => void;
        const data = new Promise<void>((resolve) => (arrive = resolve));
        let load = () => {};
        function Page() {
            const [loading, setLoading] = useState(false);
            load = () => setLoading(true);
            if (loading) use(data);
            return null;
        }
        router.refresh.mockImplementation(() => load());
        render(
            <Suspense fallback={null}>
                <Page />
                <AutoRefresh everyMs={1000} />
            </Suspense>,
        );
        await tick(1000);
        expect(router.refresh).toHaveBeenCalledTimes(1);
        await tick(3000);
        expect(health).toHaveBeenCalledTimes(1);

        await act(async () => arrive());
        await tick(1000);
        expect(health).toHaveBeenCalledTimes(2);
        expect(router.refresh).toHaveBeenCalledTimes(2);
    });

    it("waits while the tab is hidden and reloads at once when it comes back", async () => {
        render(<AutoRefresh everyMs={1000} />);
        setVisibility("hidden");
        await tick(3000);
        expect(health).not.toHaveBeenCalled();
        setVisibility("visible");
        await tick(0);
        expect(router.refresh).toHaveBeenCalledTimes(1);
    });

    it("stops when the page goes away, even with a check still out", async () => {
        let answer!: (response: Response) => void;
        health.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
        const { unmount } = render(<AutoRefresh everyMs={1000} />);
        await tick(1000);
        unmount();
        await act(async () => answer(new Response(null, { status: 204 })));
        await tick(20_000);
        setVisibility("visible");
        expect(health).toHaveBeenCalledTimes(1);
        expect(router.refresh).not.toHaveBeenCalled();
    });
});
