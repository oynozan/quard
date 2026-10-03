"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Result = { state: "idle" | "copied" | "failed"; tick: number };

const WORD = { idle: "", copied: "Copied", failed: "Copy unavailable" };

// A small Copy button for the drawer whose label swaps to "Copied" in Soft Mint
export function CopyButton({
    value,
    label = "Copy",
    className,
}: {
    value: string;
    label?: string;
    className?: string;
}) {
    const [result, setResult] = useState<Result>({ state: "idle", tick: 0 });

    useEffect(() => {
        if (result.state === "idle") return;
        const timer = setTimeout(() => setResult((r) => ({ state: "idle", tick: r.tick })), 1600);
        return () => clearTimeout(timer);
    }, [result]);

    async function copy() {
        try {
            await navigator.clipboard.writeText(value);
            setResult((r) => ({ state: "copied", tick: r.tick + 1 }));
        } catch {
            setResult((r) => ({ state: "failed", tick: r.tick + 1 }));
        }
    }

    return (
        <>
            <Button size="sm" onClick={copy} className={cn("shrink-0", className)}>
                <span className="grid">
                    <span className="invisible col-start-1 row-start-1">Copied</span>
                    <span className={cn("col-start-1 row-start-1", result.state === "copied" && "text-mint")}>
                        {result.state === "idle" ? label : WORD[result.state]}
                    </span>
                </span>
            </Button>
            <span className="sr-only" aria-live="polite">
                {WORD[result.state]}
            </span>
        </>
    );
}
