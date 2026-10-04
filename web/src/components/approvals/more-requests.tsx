"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Glyph } from "@/components/icons/glyphs";
import { moreHref, SHOWN_STEP } from "./lib/shown";

type Props = { more: number; shown: number };

// The open requests past the list, one step at a time. The address keeps how many are listed.
export function MoreRequests({ more, shown }: Props) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    return (
        <button
            type="button"
            disabled={pending}
            aria-busy={pending || undefined}
            onClick={() => startTransition(() => router.replace(moreHref(shown), { scroll: false }))}
            className="group/more inline-flex w-fit cursor-pointer items-center gap-[3px] rounded-[2px] text-[13px] text-ink-link transition-colors hover:text-ink-bright disabled:cursor-default disabled:opacity-55"
        >
            Show {Math.min(SHOWN_STEP, more)} more
            <Glyph
                name="chevronDown"
                size={14}
                aria-hidden
                className="opacity-60 transition-opacity group-hover/more:opacity-100"
            />
        </button>
    );
}
