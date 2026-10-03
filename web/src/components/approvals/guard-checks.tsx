"use client";

import { useId, useState } from "react";
import { Glyph } from "@/components/icons/glyphs";
import { StatusSquare } from "@/components/kit/labels";
import type { GuardDecision } from "@/lib/data/runs/types";
import { cn } from "@/lib/utils";
import { checkWord, passedCheck } from "./lib/model";

// Checks that need a person come first. The ones that passed fold into one count.
// A reason already shown above the checks is not repeated on its row.
export function GuardChecks({ decisions, shown }: { decisions: GuardDecision[]; shown: string }) {
    const [open, setOpen] = useState(false);
    const id = useId();
    if (decisions.length === 0) return null;
    const flagged = decisions.filter((decision) => !passedCheck(decision));
    const passed = decisions.filter((decision) => passedCheck(decision));
    return (
        <div>
            <ul className="border-t border-line">
                {flagged.map((decision) => (
                    <CheckRow key={`${decision.rule}-${decision.ruleHash}`} decision={decision} shown={shown} />
                ))}
            </ul>
            {passed.length > 0 ? (
                <>
                    <ul id={id} hidden={!open}>
                        {passed.map((decision) => (
                            <CheckRow key={`${decision.rule}-${decision.ruleHash}`} decision={decision} shown={shown} />
                        ))}
                    </ul>
                    <button
                        type="button"
                        aria-expanded={open}
                        aria-controls={id}
                        onClick={() => setOpen((value) => !value)}
                        className="group/more mt-2 inline-flex cursor-pointer items-center gap-[3px] rounded-[2px] text-[12px] text-ink-muted transition-colors hover:text-ink-bright"
                    >
                        {open ? "Hide passed checks" : `${passed.length} more passed`}
                        <Glyph
                            name="chevronDown"
                            size={14}
                            aria-hidden
                            className={cn(
                                "opacity-60 transition-[opacity,transform] group-hover/more:opacity-100",
                                open && "rotate-180",
                            )}
                        />
                    </button>
                </>
            ) : null}
        </div>
    );
}

// Rule, its reason when it fits, and the outcome. One line where there is room.
function CheckRow({ decision, shown }: { decision: GuardDecision; shown: string }) {
    const { word, tone } = checkWord(decision);
    return (
        <li className="flex items-baseline justify-between gap-4 border-b border-line py-2 text-[12px]">
            <span className="flex min-w-0 flex-wrap items-baseline gap-x-3">
                <span className="mono text-ink-2 wrap-anywhere">{decision.rule}</span>
                {decision.reason && decision.reason !== shown ? (
                    <span className="max-w-full truncate text-ink-muted">{decision.reason}</span>
                ) : null}
            </span>
            <span className="flex shrink-0 items-center gap-2 text-ink-2">
                <StatusSquare tone={tone} />
                {word}
            </span>
        </li>
    );
}
