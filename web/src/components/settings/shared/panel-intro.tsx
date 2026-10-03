import type { ReactNode } from "react";

// At most one short line on the left and the panel's action on the right
export function PanelIntro({ children, action }: { children?: ReactNode; action?: ReactNode }) {
    return (
        <div className="mb-[22px] flex min-h-9 items-center justify-between gap-6 max-[760px]:flex-col max-[760px]:items-start max-[760px]:gap-[14px]">
            <p className="flex items-center gap-[6px] text-[13px] leading-[1.6] text-ink-muted">{children}</p>
            {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
        </div>
    );
}

// A polite live region that reads out what just changed
export function LiveNote({ message }: { message: string }) {
    return (
        <p role="status" aria-live="polite" className="sr-only">
            {message}
        </p>
    );
}
