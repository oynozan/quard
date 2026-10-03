"use client";

import { useId, useState } from "react";
import { Glyph } from "@/components/icons/glyphs";
import { Hint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";

// A closed disclosure that shows a short code sample on demand
export function CodeExample({ code }: { code: string }) {
    const [open, setOpen] = useState(false);
    const id = useId();
    return (
        <div className="mt-2">
            <Hint content="Block or observe is set in code too. Rules a team writes block by default.">
                <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={id}
                    onClick={() => setOpen((value) => !value)}
                    className="group/more inline-flex items-center gap-[3px] rounded-[2px] text-[13px] text-ink-link underline decoration-line-hover underline-offset-[3px] transition-colors hover:text-ink-bright hover:decoration-ink-2"
                >
                    {open ? "Hide example" : "Show example"}
                    <Glyph
                        name="chevronRight"
                        size={14}
                        aria-hidden
                        className={cn(
                            "opacity-60 transition-transform group-hover/more:opacity-100",
                            open && "rotate-90",
                        )}
                    />
                </button>
            </Hint>
            <pre
                id={id}
                hidden={!open}
                className="mono mt-3 overflow-x-auto rounded-md bg-recess px-3 py-[10px] text-[12px] leading-[1.6] text-ink-soft"
            >
                {code}
            </pre>
        </div>
    );
}
