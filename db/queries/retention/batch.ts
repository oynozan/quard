import type { DeleteResult } from "kysely";

// Asked between batches; true stops the cleanup early
export type Stopped = () => boolean;

// Runs one batched delete until a batch comes back short. Returns the rows deleted.
export async function inBatches(
    size: number,
    remove: (limit: number) => Promise<DeleteResult>,
    stopped: Stopped,
): Promise<number> {
    let total = 0;
    while (!stopped()) {
        const count = Number((await remove(size)).numDeletedRows);
        total += count;
        if (count < size) {
            break;
        }
    }
    return total;
}
