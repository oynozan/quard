import { describe, expect, it } from "vitest";
import { createLimit } from "./limit.ts";

const tick = () => new Promise((resolve) => setTimeout(resolve, 1));

describe("createLimit", () => {
    it("runs at most the given number of tasks at once, and every task", async () => {
        const limit = createLimit(3);
        const caller = {};
        let running = 0;
        let most = 0;
        const task = async (i: number) => {
            running += 1;
            most = Math.max(most, running);
            await tick();
            running -= 1;
            return i;
        };

        const results = await Promise.all(Array.from({ length: 10 }, (_, i) => limit(caller, () => task(i))));

        expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
        expect(most).toBe(3);
    });

    it("lets callers take turns, so a long queue can't hold up a later caller", async () => {
        const limit = createLimit(1);
        const [big, small] = [{}, {}];
        const started: string[] = [];
        const task = (name: string) => async () => {
            started.push(name);
            await tick();
        };

        await Promise.all([
            ...["a1", "a2", "a3", "a4"].map((name) => limit(big, task(name))),
            limit(small, task("b1")),
        ]);

        expect(started).toEqual(["a1", "a2", "b1", "a3", "a4"]);
    });

    it("frees the place of a task that fails", async () => {
        const limit = createLimit(1);

        await expect(limit({}, () => Promise.reject(new Error("down")))).rejects.toThrow("down");
        await expect(limit({}, async () => "next")).resolves.toBe("next");
    });
});
