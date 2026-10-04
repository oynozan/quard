// Runs at most `size` tasks at once. The rest wait their turn, and a
// finished task hands its place straight to the next one. Callers take
// turns, so one caller's long queue can't hold up another's tasks.
export function createLimit(size: number): <T>(caller: object, task: () => Promise<T>) => Promise<T> {
    let active = 0;
    // Each caller's waiting tasks. A caller just served goes to the back.
    const waiting = new Map<object, Array<() => void>>();
    const next = (): (() => void) | undefined => {
        const [first] = waiting;
        if (first === undefined) {
            return undefined;
        }
        const [caller, queue] = first;
        waiting.delete(caller);
        const start = queue.shift();
        if (queue.length > 0) {
            waiting.set(caller, queue);
        }
        return start;
    };
    return async (caller, task) => {
        if (active < size) {
            active += 1;
        } else {
            await new Promise<void>((resolve) => {
                const queue = waiting.get(caller);
                if (queue === undefined) {
                    waiting.set(caller, [resolve]);
                } else {
                    queue.push(resolve);
                }
            });
        }
        try {
            return await task();
        } finally {
            const start = next();
            if (start === undefined) {
                active -= 1;
            } else {
                start();
            }
        }
    };
}
