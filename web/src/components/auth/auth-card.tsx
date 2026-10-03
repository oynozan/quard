import type { ReactNode } from "react";
import { QuardMark } from "@/components/shell/quard-mark";

type AuthCardProps = { classifier: string; meta?: string; children: ReactNode };

// The wizard card: 520px, a tonal fill, a header strip with the mark and a mono meta on the right
export function AuthCard({ classifier, meta, children }: AuthCardProps) {
    return (
        <div className="reveal mx-auto w-full max-w-[520px] rounded-md bg-surface">
            <header className="flex items-center justify-between gap-3 border-b border-line px-[22px] py-3 text-[11px] font-light text-ink-muted">
                <span className="flex items-center gap-[10px]">
                    <QuardMark size={14} />
                    <span className="text-[13px] leading-none font-medium tracking-[-0.1px] text-ink">quard</span>
                    <span aria-hidden className="h-3 w-px bg-line-strong" />
                    <span>{classifier}</span>
                </span>
                {meta ? <span className="mono text-[11px] text-ink-muted">{meta}</span> : null}
            </header>
            <div className="px-[22px] pt-7 pb-[26px] max-[620px]:px-4 max-[620px]:pt-[22px] max-[620px]:pb-[22px]">
                {children}
            </div>
        </div>
    );
}
