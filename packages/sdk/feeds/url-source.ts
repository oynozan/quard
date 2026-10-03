import { describeError } from "../core/errors.ts";
import type { Source } from "./source.ts";

export type UrlSource<T> = Source<T | undefined> & {
    // Downloads now. Used by the timer and by tests.
    pull(): Promise<void>;
    // Settles after the first download, whether it worked or not
    ready: Promise<void>;
};

// Downloads the feed at once and then polls it with an ETag, so an
// unchanged feed is not downloaded again. A failed or invalid download
// is reported and the last good version stays. Until one download
// works, current() is undefined.
export function urlSource<T>(
    url: string,
    parse: (text: string) => T,
    onError: (message: string) => void,
    refreshMs: number,
): UrlSource<T> {
    let etag: string | undefined;
    let value: T | undefined;

    async function pull(): Promise<void> {
        try {
            const response = await fetch(url, {
                headers: etag === undefined ? {} : { "if-none-match": etag },
                signal: AbortSignal.timeout(10_000),
            });
            if (response.status === 304) {
                return;
            }
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            value = parse(await response.text());
            etag = response.headers.get("etag") ?? undefined;
        } catch (error) {
            onError(`${url}: ${describeError(error)}`);
        }
    }

    const ready = pull();
    const timer = setInterval(() => void pull(), refreshMs);
    timer.unref();

    return {
        current: () => value,
        refresh: () => undefined,
        close: () => clearInterval(timer),
        pull,
        ready,
    };
}
