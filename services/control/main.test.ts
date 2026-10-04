import type { ProjectKeys } from "@quard/db/server";
import { parseHashKey, projectHashKey } from "@quard/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

type Options = { port: number; keys: ProjectKeys };

const close = vi.hoisted(() => vi.fn(async () => {}));
const startControl = vi.hoisted(() => vi.fn(async (options: Options) => ({ port: options.port, close })));
const destroy = vi.hoisted(() => vi.fn(async () => {}));
const connect = vi.hoisted(() => vi.fn(() => ({ destroy })));

vi.mock("./server/start.ts", () => ({ startControl }));
vi.mock("@quard/db", () => ({ connect }));

afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetModules();
    for (const mock of [close, startControl, destroy, connect]) {
        mock.mockClear();
    }
    process.exitCode = undefined;
});

function stubReadyEnv(port: string) {
    vi.stubEnv("PORT", port);
    vi.stubEnv("DATABASE_URL", "postgres://db");
    vi.stubEnv("QUARD_HASH_KEY", "ab".repeat(32));
}

// Keeps the signal handlers main registers, instead of adding them to this process
function catchSignals() {
    const handlers = new Map<string, () => void>();
    vi.spyOn(process, "once").mockImplementation(((event: string, handler: () => void) => {
        handlers.set(event, handler);
        return process;
    }) as typeof process.once);
    return handlers;
}

describe("control main", () => {
    it("connects to the database and listens on the port from PORT", async () => {
        stubReadyEnv("5999");
        catchSignals();
        const log = vi.spyOn(console, "log").mockImplementation(() => {});

        await import("./main.ts");

        expect(connect).toHaveBeenCalledWith("postgres://db");
        expect(startControl).toHaveBeenCalledWith(
            expect.objectContaining({ db: { destroy }, databaseUrl: "postgres://db", port: 5999 }),
        );
        expect(log).toHaveBeenCalledWith("control listening on port 5999");
        const keys = startControl.mock.calls[0]?.[0].keys;
        const hashKey = projectHashKey(parseHashKey("ab".repeat(32)), "project-1").toString("hex");
        expect(keys?.hashKey("project-1")).toBe(hashKey);
    });

    it("falls back to port 4200", async () => {
        stubReadyEnv("");
        catchSignals();
        vi.spyOn(console, "log").mockImplementation(() => {});

        await import("./main.ts");

        expect(startControl).toHaveBeenCalledWith(expect.objectContaining({ port: 4200 }));
    });

    it("closes once on SIGTERM or SIGINT, then lets go of the database", async () => {
        stubReadyEnv("5999");
        const handlers = catchSignals();
        vi.spyOn(console, "log").mockImplementation(() => {});
        await import("./main.ts");

        handlers.get("SIGTERM")?.();
        handlers.get("SIGINT")?.();
        await vi.waitFor(() => expect(destroy).toHaveBeenCalled());

        expect(close).toHaveBeenCalledTimes(1);
        expect(destroy).toHaveBeenCalledTimes(1);
    });

    it("stops with a message when the settings are missing", async () => {
        vi.stubEnv("DATABASE_URL", "");
        const error = vi.spyOn(console, "error").mockImplementation(() => {});

        await import("./main.ts");

        expect(error).toHaveBeenCalledWith("DATABASE_URL is not set");
        expect(process.exitCode).toBe(1);
        expect(startControl).not.toHaveBeenCalled();
    });
});
