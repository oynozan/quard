import type { DeleteResult } from "kysely";
import { describe, expect, it, vi } from "vitest";
import { inBatches } from "./batch.ts";

const deleted = (n: number) => ({ numDeletedRows: BigInt(n) }) as DeleteResult;

describe("inBatches", () => {
    it("deletes batch after batch until one comes back short", async () => {
        const remove = vi.fn<(limit: number) => Promise<DeleteResult>>();
        remove.mockResolvedValueOnce(deleted(2)).mockResolvedValueOnce(deleted(2)).mockResolvedValueOnce(deleted(1));

        expect(await inBatches(2, remove, () => false)).toBe(5);
        expect(remove.mock.calls).toEqual([[2], [2], [2]]);
    });

    it("stops between batches when asked to", async () => {
        const remove = vi.fn(async () => deleted(2));
        let calls = 0;

        expect(await inBatches(2, remove, () => ++calls > 1)).toBe(2);
        expect(remove).toHaveBeenCalledTimes(1);
    });
});
