import { cn } from "@/lib/utils";
import type { Label, RunStatus } from "@/lib/data/types";

// The 6px square that marks a state. Never a pill, never a check icon.
export function StatusSquare({ tone }: { tone: "on" | "off" | "context" | "warning" | "danger" }) {
    const styles = {
        on: "bg-signal",
        off: "border border-line-strong bg-transparent",
        context: "bg-chart-context",
        warning: "bg-warning",
        danger: "bg-danger",
    };
    return <span aria-hidden className={cn("inline-block size-[6px] shrink-0", styles[tone])} />;
}

const RUN_TONE: Record<RunStatus, "on" | "context" | "warning" | "danger"> = {
    running: "on",
    waiting: "warning",
    completed: "context",
    failed: "danger",
    blocked: "danger",
};

const RUN_WORD: Record<RunStatus, string> = {
    running: "Running",
    waiting: "Waiting",
    completed: "Completed",
    failed: "Failed",
    blocked: "Blocked",
};

export function RunStatusLabel({ status }: { status: RunStatus }) {
    return (
        <span className="inline-flex items-center gap-2 text-[12px] text-ink-2">
            <StatusSquare tone={RUN_TONE[status]} />
            {RUN_WORD[status]}
        </span>
    );
}

// An origin label: where content came from, with its trust and sensitivity.
// Untrusted origins get the warm fill so they stand out without turning red.
export function LabelChip({ label }: { label: Label }) {
    const untrusted = label.trust === "untrusted";
    return (
        <span
            className={cn(
                "mono inline-flex max-w-full items-center gap-[6px] rounded-sm px-[7px] text-[11px] leading-[20px]",
                untrusted ? "bg-caution-surface text-caution-text" : "bg-tile text-ink-2",
            )}
            title={`${label.origin} · ${label.trust} · ${label.sensitivity}`}
        >
            <span className="truncate">{label.origin}</span>
            <span className="shrink-0 opacity-70">{untrusted ? "untrusted" : "trusted"}</span>
        </span>
    );
}

// A flat classifier chip. Never colored.
export function Badge({ children }: { children: React.ReactNode }) {
    return (
        <span className="inline-flex items-center rounded-sm bg-tile px-[7px] py-px text-[12px] whitespace-nowrap text-ink-2">
            {children}
        </span>
    );
}
