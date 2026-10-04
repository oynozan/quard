import { HASH_KEY_PATH, parseHashKey, projectHashKey } from "@quard/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

const serve = vi.hoisted(() =>
    vi.fn((options: { port: number }, onListen: (info: { port: number }) => void) => {
        onListen({ port: options.port });
    }),
);
const connect = vi.hoisted(() => vi.fn(() => ({})));
const projectForKey = vi.hoisted(() => vi.fn(async (_db: unknown, _key: string) => "project-1"));

vi.mock("@hono/node-server", () => ({ serve }));
vi.mock("@quard/db", () => ({ connect, ingestBatch: vi.fn(), projectForKey, storeLabelRecords: vi.fn() }));

afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetModules();
    serve.mockClear();
    connect.mockClear();
    process.exitCode = undefined;
});

function stubReadyEnv(port: string) {
    vi.stubEnv("PORT", port);
    vi.stubEnv("DATABASE_URL", "postgres://db");
    vi.stubEnv("QUARD_HASH_KEY", "ab".repeat(32));
}

describe("webhook main", () => {
    it("connects to the database and listens on the port from PORT", async () => {
        stubReadyEnv("5999");
        const log = vi.spyOn(console, "log").mockImplementation(() => {});

        await import("./main.ts");

        expect(connect).toHaveBeenCalledWith("postgres://db");
        expect(serve).toHaveBeenCalledWith(expect.objectContaining({ port: 5999 }), expect.any(Function));
        expect(log).toHaveBeenCalledWith("webhook listening on port 5999");
    });

    it("serves each project's hash key, made from QUARD_HASH_KEY", async () => {
        stubReadyEnv("5999");
        vi.spyOn(console, "log").mockImplementation(() => {});

        await import("./main.ts");

        const { fetch } = serve.mock.calls[0]?.[0] as unknown as { fetch(request: Request): Promise<Response> };
        const headers = { authorization: "Bearer qk_live_abc" };
        const res = await fetch(new Request(`http://webhook${HASH_KEY_PATH}`, { headers }));
        const hashKey = projectHashKey(parseHashKey("ab".repeat(32)), "project-1").toString("hex");
        expect(await res.json()).toEqual({ hashKey });
        expect(projectForKey).toHaveBeenCalledWith({}, "qk_live_abc");
    });

    it("falls back to port 4100", async () => {
        stubReadyEnv("");
        vi.spyOn(console, "log").mockImplementation(() => {});

        await import("./main.ts");

        expect(serve).toHaveBeenCalledWith(expect.objectContaining({ port: 4100 }), expect.any(Function));
    });

    it("stops with a message when the settings are missing", async () => {
        vi.stubEnv("DATABASE_URL", "");
        const error = vi.spyOn(console, "error").mockImplementation(() => {});

        await import("./main.ts");

        expect(error).toHaveBeenCalledWith("DATABASE_URL is not set");
        expect(process.exitCode).toBe(1);
        expect(serve).not.toHaveBeenCalled();
    });
});
