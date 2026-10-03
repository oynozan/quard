"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";

// A tiny same-origin route that answers while the server is up
export const HEALTH_URL = "/api/health";

// A refresh while offline makes Next reload the whole page, maybe onto a browser error page.
// A session that ran out counts as up, so the refresh can send the person to sign in.
async function serverAnswers(): Promise<boolean> {
    try {
        const response = await fetch(HEALTH_URL, { cache: "no-store" });
        return response.status < 500;
    } catch {
        return false;
    }
}

// Reloads the page's server data every few seconds while the tab is in view,
// and at once when the tab comes back. Client state, such as an open confirm, stays.
// A tick is skipped while the last refresh runs or the server does not answer.
export function AutoRefresh({ everyMs = 5000 }: { everyMs?: number }) {
    const router = useRouter();
    const [refreshing, startTransition] = useTransition();
    const busy = useRef(false);

    useEffect(() => {
        busy.current = refreshing;
    }, [refreshing]);

    useEffect(() => {
        let stopped = false;
        let checking = false;
        const refresh = async () => {
            if (document.visibilityState !== "visible" || checking || busy.current) return;
            checking = true;
            const up = await serverAnswers();
            checking = false;
            if (up && !stopped) startTransition(() => router.refresh());
        };
        const timer = window.setInterval(refresh, everyMs);
        document.addEventListener("visibilitychange", refresh);
        return () => {
            stopped = true;
            window.clearInterval(timer);
            document.removeEventListener("visibilitychange", refresh);
        };
    }, [router, everyMs]);

    return null;
}
