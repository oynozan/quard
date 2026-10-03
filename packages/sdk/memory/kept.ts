import { mergeLabels, type MemoryLabels } from "./merge.ts";

const MAX_KEPT = 10_000;

// Labels of items this process wrote, by print, so it reads its own
// labels back with no backend
const kept = new Map<string, MemoryLabels>();

// Writing the same content again keeps the least trusted labels
export function keepLabels(print: string, labels: MemoryLabels): void {
    const old = kept.get(print);
    kept.delete(print);
    kept.set(print, old === undefined ? labels : mergeLabels(old, labels));
    // Maps keep insertion order, so the first key is the oldest
    if (kept.size > MAX_KEPT) {
        kept.delete(kept.keys().next().value as string);
    }
}

export function keptLabels(print: string): MemoryLabels | undefined {
    return kept.get(print);
}

// Drops the kept labels, as if the reader ran in another process
export function clearMemory(): void {
    kept.clear();
}
