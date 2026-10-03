import { CUT } from "./masks.ts";
import { removeSecrets, SECRET_FIELD } from "./secrets.ts";

const MAX_DEPTH = 32;

// Secrets removed, every other value kept in full. For what a person must
// see as it is, like the arguments of a call that waits for approval.
export function stripSecrets(input: unknown, depth = 0): unknown {
    if (typeof input === "string") {
        return removeSecrets(input);
    }
    if (input === null || typeof input !== "object") {
        return input;
    }
    // Too deep to check, so nothing in it is kept
    if (depth >= MAX_DEPTH) {
        return CUT;
    }
    if (Array.isArray(input)) {
        return input.map((item: unknown) => stripSecrets(item, depth + 1));
    }
    return Object.fromEntries(
        Object.entries(input).map(([name, item]) => [
            removeSecrets(name),
            SECRET_FIELD.test(name) ? CUT : stripSecrets(item, depth + 1),
        ]),
    );
}

// True when stripSecrets would cut part of the value for being too deep
export function tooDeepToStrip(input: unknown, depth = 0): boolean {
    if (input === null || typeof input !== "object") {
        return false;
    }
    if (depth >= MAX_DEPTH) {
        return true;
    }
    return Object.entries(input).some(([name, item]) => !SECRET_FIELD.test(name) && tooDeepToStrip(item, depth + 1));
}
