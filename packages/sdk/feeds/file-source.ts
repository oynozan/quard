import { readFileSync } from "node:fs";
import { describeError } from "../core/errors.ts";
import type { Source } from "./source.ts";

// Reads the file at once and throws if it is invalid. Later, it rereads
// the file at most once per `everyMs` and swaps in a valid new version.
// An invalid version is reported once and the last good one stays.
export function fileSource<T>(
    path: string,
    parse: (text: string) => T,
    onError: (message: string) => void,
    everyMs = 1000,
): Source<T> {
    let text = readFileSync(path, "utf8");
    let value = parse(text);
    let checkedAt = Date.now();

    return {
        current: () => value,
        refresh(now) {
            if (now - checkedAt < everyMs) {
                return;
            }
            checkedAt = now;
            try {
                const next = readFileSync(path, "utf8");
                if (next === text) {
                    return;
                }
                text = next;
                value = parse(next);
            } catch (error) {
                onError(`${path}: ${describeError(error)}`);
            }
        },
        close: () => undefined,
    };
}
