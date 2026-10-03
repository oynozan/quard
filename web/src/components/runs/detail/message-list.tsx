"use client";

import { useId, useState } from "react";
import { Glyph } from "@/components/icons/glyphs";
import { LabelChip } from "@/components/kit/labels";
import type { RunEdge } from "@/lib/data/runs/types";
import { cn } from "@/lib/utils";
import { EDGE_WORD, formatOffset } from "./lib/words";

// Every message and handoff in time order, folded behind one count until asked for.
export function MessageList({ edges, startedAt }: { edges: RunEdge[]; startedAt: number }) {
    const [open, setOpen] = useState(false);
    const id = useId();
    if (edges.length === 0) return <p className="mt-6 text-[12px] text-ink-absent">No messages</p>;
    return (
        <div className="mt-5">
            <button
                type="button"
                aria-expanded={open}
                aria-controls={id}
                onClick={() => setOpen((value) => !value)}
                className="group/more inline-flex cursor-pointer items-center gap-[3px] rounded-[2px] text-[12px] text-ink-link transition-colors hover:text-ink-bright"
            >
                {edges.length} {edges.length === 1 ? "message" : "messages"}
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
            <ol id={id} hidden={!open} className="mt-2 border-t border-line">
                {edges.map((edge) => (
                    <li
                        key={edge.stepId}
                        className="grid grid-cols-[68px_minmax(0,1fr)] gap-x-3 gap-y-1 border-b border-line py-[10px] text-[12px]"
                    >
                        <span className="mono pt-px text-[11px] text-ink-muted">
                            {formatOffset(edge.at - startedAt)}
                        </span>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-ink-2">{EDGE_WORD[edge.kind]}</span>
                                <span className="mono inline-flex items-center gap-1 text-ink">
                                    {edge.from}
                                    <Glyph name="chevronRight" size={11} className="opacity-60" />
                                    {edge.to}
                                </span>
                                <span className="mono text-[11px] text-ink-muted">{edge.channel}</span>
                                {edge.carries.map((label) => (
                                    <LabelChip key={label.origin} label={label} />
                                ))}
                            </div>
                            <p title={edge.summary} className="mt-1 line-clamp-2 leading-[1.6] text-ink-note">
                                {edge.summary}
                            </p>
                        </div>
                    </li>
                ))}
            </ol>
        </div>
    );
}
