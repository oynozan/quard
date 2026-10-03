import { afterEach, describe, expect, it, vi } from "vitest";

const serve = vi.hoisted(() =>
    vi.fn((options: { port: number }, onListen: (info: { port: number }) => void) => {
        onListen({ port: options.port });
    }),
);
const connect = vi.hoisted(() => vi.fn(() => ({})));

vi.mock("@hono/node-server", () => ({ serve }));
vi.mock("@quard/db", () => ({ connect, ingestBatch: vi.fn(), projectForKey: vi.fn(), storeLabelRecords: vi.fn() }));

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
