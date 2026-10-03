import { afterEach, describe, expect, it, vi } from "vitest";

const setupFromArgs = vi.hoisted(() => vi.fn(async () => 0));

vi.mock("./setup.ts", () => ({ setupFromArgs }));

afterEach(() => {
    process.exitCode = undefined;
});

describe("setup main", () => {
    it("passes the arguments on and sets the exit code", async () => {
        setupFromArgs.mockResolvedValueOnce(1);

        await import("./setup-main.ts");

        expect(setupFromArgs).toHaveBeenCalledWith(process.argv.slice(2), process.env);
        expect(process.exitCode).toBe(1);
    });
});
