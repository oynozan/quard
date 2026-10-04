import { createRedactor, parseHashKey, type Redactor } from "@quard/shared";

// The project's hash key. Control hands it out in its ready message and
// webhook to the agent key. The install's own key never leaves the server.
type Known = { text: string; key: Buffer; redactor: Redactor };

let known: Known | undefined;
const waiting = new Set<() => void>();

export function projectKey(): Buffer | undefined {
    return known?.key;
}

// Redacts with the project's key, once it is known
export function projectRedactor(): Redactor | undefined {
    return known?.redactor;
}

// Control and webhook hand out the same key, so either may come first
export function learnProjectKey(text: string): void {
    if (known?.text !== text) {
        const key = parseHashKey(text);
        known = { text, key, redactor: createRedactor(key) };
    }
    for (const wake of [...waiting]) {
        wake();
    }
}

// The key once known. Undefined when it is still unknown after ms, or once
// giveUp settles.
export function waitForProjectKey(ms: number, giveUp?: Promise<unknown>): Promise<Buffer | undefined> {
    if (known !== undefined) {
        return Promise.resolve(known.key);
    }
    return new Promise((resolve) => {
        const wake = () => {
            clearTimeout(timer);
            waiting.delete(wake);
            resolve(known?.key);
        };
        const timer = setTimeout(wake, ms);
        waiting.add(wake);
        void giveUp?.then(wake, wake);
    });
}

// Another agent key may belong to another project, with another key
export function forgetProjectKey(): void {
    known = undefined;
}
