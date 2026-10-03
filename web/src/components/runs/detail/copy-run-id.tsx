"use client";

import { Glyph } from "@/components/icons/glyphs";
import { copyWithToast } from "@/components/ui/toast";

// The full run id with a quiet copy control. Feedback comes as a toast.
export function CopyRunId({ id }: { id: string }) {
    return (
        <button
            type="button"
            onClick={() => void copyWithToast(id, "Run id")}
            aria-label="Copy run id"
            className="group inline-flex min-w-0 items-center gap-2 rounded-sm text-left text-ink-muted hover:text-ink-bright"
        >
            <span className="mono text-[12px] wrap-anywhere">{id}</span>
            <Glyph name="copy" size={14} className="shrink-0 opacity-60 group-hover:opacity-100" />
        </button>
    );
}
