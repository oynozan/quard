"use client";

import { useId, useState } from "react";
import { Glyph } from "@/components/icons/glyphs";
import { cn } from "@/lib/utils";

// The first paragraph, with the rest behind "Show more".
export function ReviewerText({ paragraphs }: { paragraphs: string[] }) {
    const [open, setOpen] = useState(false);
    const id = useId();
    const [first, ...rest] = paragraphs;
    return (
        <div className="flex flex-col gap-3">
            <p>{first}</p>
            {rest.length > 0 ? (
                <>
                    <div id={id} hidden={!open} className="flex flex-col gap-3">
                        {rest.map((text, i) => (
                            <p key={i}>{text}</p>
                        ))}
                    </div>
                    <button
                        type="button"
                        aria-expanded={open}
                        aria-controls={id}
                        onClick={() => setOpen((value) => !value)}
                        className="group/more inline-flex w-fit cursor-pointer items-center gap-[3px] rounded-[2px] text-[12px] text-ink-link transition-colors hover:text-ink-bright"
                    >
                        {open ? "Show less" : "Show more"}
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
