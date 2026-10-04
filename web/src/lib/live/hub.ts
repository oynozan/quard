import "server-only";
import { openListener, type Listener, type Notice } from "@quard/db";
import { toChange, type Change } from "./change";

// One open event stream, as the hub sees it
export type Subscriber = {
    project: string | undefined;
    // A change that matters to this project
    send(change: Change): void;
    // The listener hears every change from now on
    ready(): void;
    // The listener was lost, so changes were missed: the stream ends
    end(): void;
};

export type Hub = {
    // Hears changes until the returned function runs
    subscribe(subscriber: Subscriber): () => void;
};

// Waits before opening the listener again after a failed try, in ms; the last one repeats
export const BACKOFF = [1000, 2000, 5000];

// One Postgres listener shared by every open stream, opened only while someone listens.
// A stream says ready only once the listener hears, and ends when it is lost,
// so the browser reconnects and catches up instead of missing changes.
export function createHub(): Hub {
    const subscribers = new Set<Subscriber>();
    let listener: Listener | undefined;
    let opening = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;

    const heard = (notice: Notice) => {
        for (const subscriber of subscribers) {
            const change = toChange(notice, subscriber.project);
            if (change) subscriber.send(change);
        }
    };

    const retry = () => {
        if (subscribers.size === 0) return;
        const wait = BACKOFF[Math.min(attempt, BACKOFF.length - 1)];
        attempt += 1;
        timer = setTimeout(() => {
            timer = undefined;
            open();
        }, wait);
    };

    const lost = () => {
        listener = undefined;
        const ended = [...subscribers];
        subscribers.clear();
        for (const subscriber of ended) subscriber.end();
    };

    const open = () => {
        if (listener || opening || timer) return;
        opening = true;
        connect(heard, lost).then(
            (opened) => {
                opening = false;
                attempt = 0;
                if (subscribers.size === 0) {
                    void opened.close().catch(() => {});
                    return;
                }
                listener = opened;
                for (const subscriber of subscribers) subscriber.ready();
            },
            () => {
                opening = false;
                retry();
            },
        );
    };

    const shut = () => {
        clearTimeout(timer);
        timer = undefined;
        attempt = 0;
        const closing = listener;
        listener = undefined;
        void closing?.close().catch(() => {});
    };

    return {
        subscribe(subscriber) {
            subscribers.add(subscriber);
            if (listener) subscriber.ready();
            else open();
            return () => {
                if (subscribers.delete(subscriber) && subscribers.size === 0) shut();
            };
        },
    };
}

async function connect(heard: (notice: Notice) => void, lost: () => void): Promise<Listener> {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    return openListener(url, heard, lost);
}

type Holder = { quardLiveHub?: Hub };

// Kept on globalThis so dev hot reloads reuse the same listener
export function liveHub(): Hub {
    const holder = globalThis as Holder;
    holder.quardLiveHub ??= createHub();
    return holder.quardLiveHub;
}
