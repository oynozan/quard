// Runs at most `size` tasks at once. The rest wait their turn, and a
// finished task hands its place straight to the next one.
export function createLimit(size: number): <T>(task: () => Promise<T>) => Promise<T> {
    let active = 0;
    const waiting: Array<() => void> = [];
    return async (task) => {
        if (active < size) {
            active += 1;
        } else {
            await new Promise<void>((resolve) => waiting.push(resolve));
        }
        try {
            return await task();
        } finally {
            const next = waiting.shift();
            if (next === undefined) {
                active -= 1;
            } else {
                next();
            }
        }
    };
}
