"use client";

import { useEffect, useRef, useState } from "react";

// Tracks an element's content width. Starts from a server-safe guess.
export function useWidth<T extends HTMLElement>(initial: number) {
    const ref = useRef<T>(null);
    const [width, setWidth] = useState(initial);

    useEffect(() => {
        const node = ref.current;
        if (!node) return;
        const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
        observer.observe(node);
        return () => observer.disconnect();
    }, []);

    return [ref, width] as const;
}
