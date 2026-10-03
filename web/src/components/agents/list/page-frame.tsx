import type { ReactNode } from "react";
import { PAGE_WIDE } from "@/components/kit/page";

export function PageFrame({ children, busy }: { children: ReactNode; busy?: boolean }) {
    return (
        <div aria-busy={busy || undefined} className={PAGE_WIDE}>
            {children}
        </div>
    );
}

// The graph beside the roster; the roster moves under the graph on narrow screens
export function AgentsGrid({ children }: { children: ReactNode }) {
    return (
        <div className="grid grid-cols-[minmax(0,1fr)_300px] items-start gap-7 max-[1180px]:grid-cols-[minmax(0,1fr)_260px] max-[1180px]:gap-[22px] max-[980px]:grid-cols-1 max-[760px]:gap-[25px]">
            {children}
        </div>
    );
}
