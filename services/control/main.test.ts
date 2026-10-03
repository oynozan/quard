import { afterEach, describe, expect, it, vi } from "vitest";

const serve = vi.hoisted(() =>
    vi.fn((options: { port: number }, onListen: (info: { port: number }) => void) => {
        onListen({ port: options.port });
    }),
);

vi.mock("@hono/node-server", () => ({ serve }));

afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetModules();
    serve.mockClear();
});

describe("control main", () => {
    it("listens on the port from PORT", async () => {
        vi.stubEnv("PORT", "5999");
        const log = vi.spyOn(console, "log").mockImplementation(() => {});

        await import("./main.ts");

        expect(serve).toHaveBeenCalledWith(expect.objectContaining({ port: 5999 }), expect.any(Function));
        expect(log).toHaveBeenCalledWith("control listening on port 5999");
    });

    it("falls back to port 4200", async () => {
        vi.stubEnv("PORT", "");
        vi.spyOn(console, "log").mockImplementation(() => {});

        await import("./main.ts");

        expect(serve).toHaveBeenCalledWith(expect.objectContaining({ port: 4200 }), expect.any(Function));
    });
});
