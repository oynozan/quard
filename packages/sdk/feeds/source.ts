// A JSON document that can change while the app runs.
// current() always returns the last version that passed validation.
export type Source<T> = {
    current(): T;
    // Called before guarded calls; cheap when nothing is due.
    refresh(now: number): void;
    close(): void;
};
