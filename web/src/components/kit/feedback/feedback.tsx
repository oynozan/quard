import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { WarningGlyph } from "@/components/icons/glyphs";
import { CopyButton } from "@/components/kit/detail/copy-button";

type ErrorBoxProps = { children: ReactNode; help?: ReactNode; action?: ReactNode; className?: string };

// A neutral box for an interface error that says what happened and what to do, never red
export function ErrorBox({ children, help, action, className }: ErrorBoxProps) {
    return (
        <div
            role="alert"
            className={cn("mt-5 rounded-md bg-hover p-3 text-[13px] leading-[1.6] text-ink-alert", className)}
        >
            <p>{children}</p>
            {help ? <p className="mt-1 text-[12px] leading-[1.8] text-ink-muted">{help}</p> : null}
            {action ? <div className="mt-3">{action}</div> : null}
        </div>
    );
}

type WarningRuleProps = { title: ReactNode; note?: ReactNode; identifier?: string; className?: string };

// An amber left rule for something that needs attention, never a box
export function WarningRule({ title, note, identifier, className }: WarningRuleProps) {
    return (
        <div className={cn("border-l-2 border-warning pl-[14px]", className)}>
            <p className="flex gap-[9px] text-[14px] leading-[1.6] text-ink-alert">
                <WarningGlyph size={16} className="mt-[3px] shrink-0 text-warning" />
                <span className="min-w-0">{title}</span>
            </p>
            {note ? <p className="mt-1 pl-[25px] text-[13px] leading-[1.6] text-ink-note">{note}</p> : null}
            {identifier ? (
                <div className="mt-3 flex items-center justify-between gap-3 rounded-md bg-hover px-3 py-[10px]">
                    <span className="mono min-w-0 text-[12px] text-ink-soft wrap-anywhere">{identifier}</span>
                    <CopyButton value={identifier} />
                </div>
            ) : null}
        </div>
    );
}

// The one tinted box, placed before the irreversible action it qualifies
export function CautionBox({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <div
            className={cn(
                "rounded-md bg-caution-surface px-[13px] py-[11px] text-[12px] leading-[1.75] text-caution-text",
                className,
            )}
        >
            {children}
        </div>
    );
}

// An aside that opens with a hairline instead of a box
export function Notice({ children, icon, className }: { children: ReactNode; icon?: ReactNode; className?: string }) {
    return (
        <aside
            className={cn(
                "mt-7 flex gap-[10px] border-t border-line pt-[22px] text-[13px] leading-[1.8] text-ink-note",
                className,
            )}
        >
            {icon ? (
                <span aria-hidden className="mt-[3px] flex shrink-0 opacity-60">
                    {icon}
                </span>
            ) : null}
            <div className="min-w-0">{children}</div>
        </aside>
    );
}
