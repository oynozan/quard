type Stream = { completed: Promise<unknown>; error: unknown };
type Done = () => void;

// Runs `before` as a stream's run ends well, ahead of its completed
// promise and the end of its events. The SDK ends both in one internal
// method, so an app that resumes right after either one sees what
// `before` noted. An SDK without the method runs it once completed
// resolves.
export function beforeStreamEnd(result: Stream, before: () => void): void {
    const target = result as Stream & { _done?: Done };
    const done = target._done;
    if (typeof done !== "function") {
        result.completed.then(before, () => undefined);
        return;
    }
    target._done = () => {
        try {
            // A stream that failed already ended with its error
            if (result.error === null) {
                before();
            }
        } finally {
            done.call(result);
        }
    };
}
