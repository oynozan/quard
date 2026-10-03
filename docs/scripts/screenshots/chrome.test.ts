// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { launchChrome, sleep, type ChromeDeps } from "./chrome";

const spawned = vi.hoisted(() => ({ kill: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: vi.fn(() => spawned) }));

const PAGE = { type: "page", webSocketDebuggerUrl: "ws://127.0.0.1:9334/page" };

function deps(answers: unknown[]): ChromeDeps & { calls: string[][] } {
    const calls: string[][] = [];
    return {
        calls,
        spawn: (command, args) => {
            calls.push([command, ...args]);
            return spawned;
        },
        fetch: async () => {
            const next = answers.shift();
            if (next instanceof Error) throw next;
            return { json: async () => next };
        },
        sleep: async () => {},
    };
}

afterEach(() => {
    vi.unstubAllGlobals();
    spawned.kill.mockClear();
});

describe("launchChrome", () => {
    it("waits until Chrome lists a page", async () => {
        const fake = deps([new Error("not up yet"), [{ type: "service_worker" }], [PAGE]]);
        const chrome = await launchChrome("/bin/chrome", 9334, fake);
        expect(chrome.wsUrl).toBe(PAGE.webSocketDebuggerUrl);
        expect(fake.calls[0]).toContain("--remote-debugging-port=9334");
        chrome.kill();
        expect(spawned.kill).toHaveBeenCalled();
    });

    it("gives up and stops Chrome when no page appears", async () => {
        const fake = deps(Array.from({ length: 50 }, () => []));
        await expect(launchChrome("/bin/chrome", 9334, fake)).rejects.toThrow("Chrome did not start from /bin/chrome");
        expect(spawned.kill).toHaveBeenCalled();
    });

    it("uses the real spawn, fetch and sleep by default", async () => {
        vi.stubGlobal("fetch", async () => ({ json: async () => [PAGE] }));
        await expect(launchChrome("/bin/chrome", 9334)).resolves.toHaveProperty("wsUrl", PAGE.webSocketDebuggerUrl);
    });
});

describe("sleep", () => {
    it("waits the given time", async () => {
        const start = Date.now();
        await sleep(20);
        expect(Date.now() - start).toBeGreaterThanOrEqual(15);
    });
});
