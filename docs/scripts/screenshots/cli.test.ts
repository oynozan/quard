// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const main = vi.hoisted(() => vi.fn());
vi.mock("./main.ts", () => ({ main }));

afterEach(() => {
    vi.resetModules();
    process.exitCode = 0;
});

describe("cli", () => {
    it("passes the command line on and fails when screenshots had problems", async () => {
        main.mockResolvedValue(2);
        process.argv = ["node", "cli.ts", "--only", "shell"];
        await import("./cli");
        expect(main).toHaveBeenCalledWith(["--only", "shell"]);
        expect(process.exitCode).toBe(1);
    });

    it("succeeds when every screenshot worked", async () => {
        main.mockResolvedValue(0);
        await import("./cli");
        expect(process.exitCode).toBe(0);
    });
});
