// Runs a task every `ms`, one run at a time, logging a failed run and going on
export function every(ms: number, name: string, task: () => Promise<void>, log: (message: string) => void): () => void {
    let timer: NodeJS.Timeout | undefined;
    let stopped = false;

    function schedule(): void {
        if (!stopped) {
            timer = setTimeout(run, ms);
            timer.unref();
        }
    }

    async function run(): Promise<void> {
        try {
            await task();
        } catch (error) {
            log(`control: ${name} failed: ${(error as Error).message}`);
        }
        schedule();
    }

    schedule();
    return () => {
        stopped = true;
        clearTimeout(timer);
    };
}
