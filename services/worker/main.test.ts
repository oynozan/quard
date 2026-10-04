import { afterEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ destroy: vi.fn(async () => {}) }));
const connect = vi.hoisted(() => vi.fn(() => db));
const stop = vi.hoisted(() => vi.fn(async () => {}));
const startWorker = vi.hoisted(() => vi.fn((_options: object) => ({ stop })));

vi.mock("@quard/db", () => ({ connect }));
vi.mock("./runner/worker.ts", () => ({ startWorker }));

afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetModules();
    vi.clearAllMocks();
    process.exitCode = undefined;
});

describe("worker main", () => {
    it("starts the worker, and on SIGTERM or SIGINT stops it once and closes the database", async () => {
        vi.stubEnv("DATABASE_URL", "postgres://db");
        vi.stubEnv("OPENAI_API_KEY", "sk-test");

        await import("./main.ts");

        expect(connect).toHaveBeenCalledWith("postgres://db");
        expect(startWorker).toHaveBeenCalledWith({
            db,
            openai: { apiKey: "sk-test", baseUrl: "https://api.openai.com/v1" },
        });

        process.emit("SIGTERM");
        process.emit("SIGINT");
        await vi.waitFor(() => expect(db.destroy).toHaveBeenCalledTimes(1));
        expect(stop).toHaveBeenCalledTimes(1);
    });

    it("stops with a message when the settings are missing", async () => {
        vi.stubEnv("DATABASE_URL", "");
        const error = vi.spyOn(console, "error").mockImplementation(() => {});

        await import("./main.ts");

        expect(error).toHaveBeenCalledWith("DATABASE_URL is not set");
        expect(process.exitCode).toBe(1);
        expect(startWorker).not.toHaveBeenCalled();
    });
});
