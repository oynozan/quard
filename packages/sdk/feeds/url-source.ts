import { describeError } from "../core/errors.ts";
import type { Source } from "./source.ts";

export type UrlSource<T> = Source<T | undefined> & {
    // Downloads now, or joins the download in flight
    pull(): Promise<void>;
    // Settles when the download in flight is done
    settled(): Promise<void>;
};

// Downloads the feed at once and then polls it with an ETag, so an
// unchanged feed is not downloaded again. A failed or invalid download
// is reported and the last good version stays. Until one download
// works, current() is undefined and refresh() tries again at most once
// per `retryMs`.
export function urlSource<T>(
    url: string,
    parse: (text: string) => T,
    onError: (message: string) => void,
    refreshMs: number,
    retryMs = 5000,
): UrlSource<T> {
    let etag: string | undefined;
    let value: T | undefined;
    let inFlight: Promise<void> | undefined;
    let triedAt = Date.now();

    async function download(): Promise<void> {
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

    function pull(): Promise<void> {
        inFlight ??= download().finally(() => {
            inFlight = undefined;
            triedAt = Date.now();
        });
        return inFlight;
    }

    void pull();
    const timer = setInterval(() => void pull(), refreshMs);
    timer.unref();

    return {
        current: () => value,
        refresh(now) {
            if (value === undefined && now - triedAt >= retryMs) {
                void pull();
            }
        },
        settled: () => inFlight ?? Promise.resolve(),
        close: () => clearInterval(timer),
        pull,
    };
}
