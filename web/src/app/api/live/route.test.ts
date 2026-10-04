// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getSession: vi.fn(async (): Promise<object | null> => ({ sub: "did:privy:1" })),
    currentProject: vi.fn(async (): Promise<{ id: string } | undefined> => ({ id: "p1" })),
    unsubscribe: vi.fn(),
    subscribe: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/data/runs/live/client", () => ({ database: () => ({ db: true }) }));
vi.mock("@/lib/data/runs/live/project", () => ({ currentProject: mocks.currentProject }));
vi.mock("@/lib/live/hub", () => ({ liveHub: () => ({ subscribe: mocks.subscribe }) }));

const route = await import("./route");

beforeEach(() => {
    mocks.subscribe.mockReset().mockReturnValue(mocks.unsubscribe);
    mocks.unsubscribe.mockClear();
});

afterEach(() => {
    mocks.getSession.mockClear();
    vi.unstubAllEnvs();
});

const scope = () => mocks.subscribe.mock.calls[0][0].project;

describe("GET /api/live", () => {
    it("runs per request on Node", () => {
        expect(route.dynamic).toBe("force-dynamic");
        expect(route.runtime).toBe("nodejs");
    });

    it("turns away a visitor without a session", async () => {
        mocks.getSession.mockResolvedValueOnce(null);
        const response = await route.GET(new Request("http://dash/api/live"));

        expect(response.status).toBe(401);
        expect(response.headers.get("Cache-Control")).toBe("no-store");
        expect(mocks.subscribe).not.toHaveBeenCalled();
    });

    it("streams events for the signed-in project until the request aborts", async () => {
        const abort = new AbortController();
        const response = await route.GET(new Request("http://dash/api/live", { signal: abort.signal }));

        expect(response.status).toBe(200);
        expect(response.headers.get("Content-Type")).toBe("text/event-stream; charset=utf-8");
        expect(response.headers.get("Cache-Control")).toBe("no-cache, no-transform");
        expect(response.headers.get("X-Accel-Buffering")).toBe("no");
        expect(scope()).toBe("p1");

        const reader = response.body!.getReader();
        const first = await reader.read();
        expect(new TextDecoder().decode(first.value)).toContain("retry: 2000");
        abort.abort();
        expect((await reader.read()).done).toBe(true);
        expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
    });

    it("keeps the stream open before a project exists", async () => {
        vi.stubEnv("QUARD_PROJECT_ID", " ");
        mocks.currentProject.mockResolvedValueOnce(undefined);
        const response = await route.GET(new Request("http://dash/api/live"));

        expect(response.status).toBe(200);
        expect(scope()).toBeUndefined();
        await response.body!.cancel();
        expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
    });

    it("stays scoped to a configured project id that matches no project", async () => {
        vi.stubEnv("QUARD_PROJECT_ID", " p-missing ");
        mocks.currentProject.mockResolvedValueOnce(undefined);
        const response = await route.GET(new Request("http://dash/api/live"));

        expect(scope()).toBe("p-missing");
        await response.body!.cancel();
    });
});
