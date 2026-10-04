"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { serverAnswers } from "@/components/kit/auto-refresh";
import { mattersHere, parseChange } from "./change";
import { LiveStatusProvider, type LiveStatus } from "./status";

export const LIVE_URL = "/api/live";
// At most one refresh this often; changes in between get one trailing refresh
export const REFRESH_GAP_MS = 2000;
// A page nothing refreshed for this long refreshes anyway, since some of
// what it shows comes from the clock, like a call that stopped beating
export const IDLE_REFRESH_MS = 15_000;
// A first stream ready this soon after the page loaded missed nothing
export const FRESH_MS = 500;
// A stream the server refused stays closed, so it is opened again after this long
export const REOPEN_MS = 5000;

// Keeps every dashboard page in step with the server over one event stream.
// Changes that matter to the page refresh its server data; client state stays.
// A hidden tab closes its stream, since browsers allow few connections per
// host, and catches up when it is shown again.
export function LiveUpdates({ children }: { children: ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const [status, setStatus] = useState<LiveStatus>("connecting");
    const [refreshing, startTransition] = useTransition();
    const path = useRef(pathname);
    const busy = useRef(false);
    const settled = useRef(() => {});

    useEffect(() => {
        path.current = pathname;
    }, [pathname]);

    useEffect(() => {
        busy.current = refreshing;
        if (!refreshing) settled.current();
    }, [refreshing]);

    useEffect(() => {
        let source: EventSource | null = null;
        let up = false;
        let readyBefore = false;
        let refused = false;
        let again = false;
        let stopped = false;
        let lastRefresh = -Infinity;
        let trailing: number | undefined;
        let idle: number | undefined;
        let reopen: number | undefined;

        const rest = () => {
            window.clearTimeout(idle);
            idle = window.setTimeout(refresh, IDLE_REFRESH_MS);
        };

        // Only while the stream is up: with the server gone, Next turns a
        // refresh into a full reload onto an error page. Every way back up refreshes.
        const refresh = () => {
            if (!up) return;
            if (busy.current) {
                again = true;
                return;
            }
            const wait = lastRefresh + REFRESH_GAP_MS - Date.now();
            if (wait > 0) {
                trailing ??= window.setTimeout(() => {
                    trailing = undefined;
                    refresh();
                }, wait);
                return;
            }
            lastRefresh = Date.now();
            rest();
            startTransition(() => router.refresh());
        };

        // A refresh asked for while the last one ran goes out once it is done
        settled.current = () => {
            if (!again) return;
            again = false;
            refresh();
        };

        const down = () => {
            up = false;
            window.clearTimeout(trailing);
            trailing = undefined;
            window.clearTimeout(idle);
        };

        const ready = () => {
            setStatus("live");
            up = true;
            refused = false;
            // Changes made before the stream heard them reach the page this way
            if (readyBefore || performance.now() >= FRESH_MS) refresh();
            else rest();
            readyBefore = true;
        };

        const onChange = (event: MessageEvent<string>) => {
            const change = parseChange(event.data);
            if (change && mattersHere(change, path.current)) refresh();
        };

        // A refused stream may mean the session ran out. If the server
        // answers, a refresh sends the person to sign in.
        const checkRefusal = async () => {
            if (refused) return;
            refused = true;
            if ((await serverAnswers()) && !stopped) startTransition(() => router.refresh());
        };

        const open = () => {
            const next = new EventSource(LIVE_URL);
            next.addEventListener("ready", ready);
            next.addEventListener("change", onChange);
            next.onerror = () => {
                setStatus("offline");
                down();
                // The browser reconnects by itself unless the server refused the stream
                if (next.readyState !== EventSource.CLOSED) return;
                source = null;
                reopen = window.setTimeout(() => {
                    reopen = undefined;
                    open();
                }, REOPEN_MS);
                void checkRefusal();
            };
            source = next;
        };

        const close = () => {
            source?.close();
            source = null;
            window.clearTimeout(reopen);
            reopen = undefined;
            down();
        };

        const onVisibility = () => {
            if (document.visibilityState === "hidden") close();
            else if (!source && reopen === undefined) open();
        };

        if (document.visibilityState !== "hidden") open();
        document.addEventListener("visibilitychange", onVisibility);
        return () => {
            stopped = true;
            close();
            document.removeEventListener("visibilitychange", onVisibility);
        };
    }, [router]);

    return <LiveStatusProvider value={status}>{children}</LiveStatusProvider>;
}
