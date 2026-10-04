import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const runPlayground = vi.hoisted(() => vi.fn(async (_dir: string) => 0));
vi.mock("./run-scenario.ts", () => ({ runPlayground }));

const argv = process.argv;

afterEach(() => {
    process.argv = argv;
    process.exitCode = undefined;
    vi.resetModules();
    runPlayground.mockClear();
});

describe("run main", () => {
    it("runs the files next to it and exits with the code it gets", async () => {
        process.argv = ["node", "run.ts"];
        runPlayground.mockResolvedValueOnce(1);

        await import("./run.ts");

        expect(runPlayground).toHaveBeenCalledWith(import.meta.dirname);
        expect(process.exitCode).toBe(1);
    });

    it("runs the files in the folder it is given", async () => {
        process.argv = ["node", "run.ts", "some/folder"];

        await import("./run.ts");

        expect(runPlayground).toHaveBeenCalledWith(resolve("some/folder"));
        expect(process.exitCode).toBe(0);
    });
});
