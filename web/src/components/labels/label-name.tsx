import { StatusSquare } from "@/components/kit/labels";
import { isRiskyLabel } from "@quard/shared";

// A content label's name. Risky labels carry the warning square.
export function LabelName({ label }: { label: string }) {
    return (
        <span className="mono inline-flex min-w-0 items-center gap-2 text-[12px] text-ink">
            {isRiskyLabel(label) ? <StatusSquare tone="warning" /> : null}
            <span className="truncate">{label}</span>
        </span>
    );
}

const FALLBACK_WORD = { pending: "Waiting", skipped: "Skipped", failed: "Failed" } as const;

// What the AI fallback said, or how far it got
export function FallbackValue({
    fallback,
}: {
    fallback: { state: keyof typeof FALLBACK_WORD | "done"; label: string | null } | null;
}) {
    if (fallback === null) return <span className="text-ink-faint">—</span>;
    if (fallback.state === "done" && fallback.label !== null) return <LabelName label={fallback.label} />;
    return (
        <span className="text-[12px] text-ink-muted">
            {fallback.state === "done" ? "—" : FALLBACK_WORD[fallback.state]}
        </span>
    );
}
