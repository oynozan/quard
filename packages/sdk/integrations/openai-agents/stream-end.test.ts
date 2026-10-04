import { StreamedRunResult } from "@openai/agents";
import { describe, expect, it, vi } from "vitest";
import { beforeStreamEnd } from "./stream-end.ts";

type Internal = { _done(): void; _raiseError(error: unknown): void };

function stream(): StreamedRunResult<never, never> & Internal {
    return new StreamedRunResult() as StreamedRunResult<never, never> & Internal;
}

describe("beforeStreamEnd", () => {
    it("runs before the completed promise resolves and the events end", async () => {
        const result = stream();
        const order: string[] = [];
        beforeStreamEnd(result, () => order.push("noted"));
        const read = (async () => {
            for await (const _event of result) {
                // Reads the stream to its end
            }
            order.push("read");
        })();
        const completed = result.completed.then(() => order.push("completed"));

        result._done();

        expect(order).toEqual(["noted"]);
        await Promise.all([read, completed]);
        expect(order).toEqual(expect.arrayContaining(["noted", "read", "completed"]));
    });

    it("skips a stream that already ended with an error", async () => {
        const result = stream();
        const before = vi.fn();
        beforeStreamEnd(result, before);

        result._raiseError(new Error("model failed"));
        result._done();

        await expect(result.completed).rejects.toThrow("model failed");
        expect(before).not.toHaveBeenCalled();
    });

    it("still ends the stream when before throws", async () => {
        const result = stream();
        beforeStreamEnd(result, () => {
            throw new Error("noting failed");
        });

        expect(() => result._done()).toThrow("noting failed");
        await expect(result.completed).resolves.toBeUndefined();
    });

    it("waits for completed when the SDK has no internal end method", async () => {
        let finish: () => void = () => undefined;
        const completed = new Promise<void>((resolve) => (finish = resolve));
        const before = vi.fn();

        beforeStreamEnd({ completed, error: null }, before);
        expect(before).not.toHaveBeenCalled();
        finish();
        await completed;

        expect(before).toHaveBeenCalledTimes(1);
    });

    it("runs nothing when the stream fails on an SDK with no internal end method", async () => {
        const completed = Promise.reject(new Error("model failed"));
        const before = vi.fn();

        beforeStreamEnd({ completed, error: null }, before);

        await expect(completed).rejects.toThrow("model failed");
        expect(before).not.toHaveBeenCalled();
    });
});
