import { afterEach, describe, expect, it, vi } from "vitest";

const stop = vi.hoisted(() => vi.fn(async () => {}));
const startDevServer = vi.hoisted(() =>
    vi.fn(async () => ({ url: "postgres://postgres@127.0.0.1:5432/postgres", stop })),
);

vi.mock("./server.ts", () => ({ startDevServer }));

afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetModules();
    startDevServer.mockClear();
});

describe("dev server main", () => {
    it("keeps its data in db/.pglite and prints the database URL", async () => {
        vi.stubEnv("PORT", "54329");
        const log = vi.spyOn(console, "log").mockImplementation(() => {});

        await import("./server-main.ts");

        expect(startDevServer).toHaveBeenCalledWith({ dataDir: expect.stringMatching(/db\/\.pglite$/), port: 54329 });
        expect(log).toHaveBeenCalledWith(expect.stringContaining("DATABASE_URL=postgres://"));
    });

    it("uses port 5432 by default and stops cleanly on Ctrl-C", async () => {
        vi.stubEnv("PORT", undefined as unknown as string);
        delete process.env.PORT;
        vi.spyOn(console, "log").mockImplementation(() => {});
        const exit = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);

        await import("./server-main.ts");
        process.emit("SIGINT");
        await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));

        expect(startDevServer).toHaveBeenCalledWith(expect.objectContaining({ port: 5432 }));
        expect(stop).toHaveBeenCalled();
    });
});
