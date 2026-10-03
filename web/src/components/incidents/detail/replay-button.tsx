"use client";

import { LiquidMetalButton } from "@/components/liquid-metal/liquid-metal-button";
import { Button } from "@/components/ui/button";
import { useReplay } from "./replay-context";

// The page's main action. The liquid-metal button is used once, here.
export function ReplayButton() {
    const { running, allowed, start } = useReplay();
    if (running) {
        return (
            <Button busy className="h-[46px] min-w-[142px]">
                Replaying…
            </Button>
        );
    }
    return (
        <LiquidMetalButton
            label="Replay round"
            onClick={start}
            disabled={!allowed.ok}
            title={allowed.reason ?? "Rerun the turning-point call 5 times with and 5 without the content"}
        />
    );
}
