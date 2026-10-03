"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CautionBox } from "@/components/kit/feedback/feedback";
import { Hint } from "@/components/ui/hint";
import type { ApprovalAnswer } from "@/lib/data/approvals/types";

type Props = {
    agent: string;
    tool: string;
    live: boolean;
    onAnswer(answer: ApprovalAnswer): void;
};

// Approve once, always approve, or deny after an inline confirm.
export function RequestActions({ agent, tool, live, onAnswer }: Props) {
    const [confirming, setConfirming] = useState(false);
    const denyRef = useRef<HTMLButtonElement>(null);
    const confirmRef = useRef<HTMLButtonElement>(null);
    const opened = useRef(false);

    useEffect(() => {
        if (confirming) confirmRef.current?.focus();
        else if (opened.current) denyRef.current?.focus();
        opened.current = confirming || opened.current;
    }, [confirming]);

    if (confirming) {
        return (
            <div className="grid max-w-[560px] gap-3">
                <CautionBox>
                    Deny <span className="mono">{tool}</span>? <span className="mono">{agent}</span> gets a refusal.
                    This cannot be undone.
                </CautionBox>
                <div className="flex flex-wrap gap-2">
                    <Button ref={confirmRef} variant="destructive" onClick={() => onAnswer("deny")}>
                        Deny call
                    </Button>
                    <Button variant="ghost" onClick={() => setConfirming(false)}>
                        Cancel
                    </Button>
                </div>
            </div>
        );
    }

    const once = (
        <Button variant="default" onClick={() => onAnswer("approve once")}>
            Approve once
        </Button>
    );

    return (
        <div className="flex flex-wrap items-center gap-2 max-[560px]:grid max-[560px]:grid-cols-1">
            {live ? (
                once
            ) : (
                <Hint content="The process stopped. The next identical call uses this approval.">{once}</Hint>
            )}
            <Hint content="Same agent, tool and exact arguments, in any run, until revoked.">
                <Button variant="outline" onClick={() => onAnswer("always approve")}>
                    Always approve
                </Button>
            </Hint>
            <Button ref={denyRef} variant="destructive" onClick={() => setConfirming(true)}>
                Deny
            </Button>
        </div>
    );
}
