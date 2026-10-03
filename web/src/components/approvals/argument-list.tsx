import { WarningGlyph } from "@/components/icons/glyphs";
import { LabelChip } from "@/components/kit/labels";
import type { ApprovalArgDetail } from "@/lib/data/approvals/types";

// Every argument with its full value, so the approver sees exactly what will run.
export function ArgumentList({ args }: { args: ApprovalArgDetail[] }) {
    return (
        <dl className="border-t border-line">
            {args.map((arg) => (
                <div
                    key={arg.name}
                    className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-4 border-b border-line py-[10px] max-[560px]:grid-cols-1 max-[560px]:gap-y-1"
                >
                    <dt className="mono text-[12px] leading-[1.7] text-ink-muted wrap-anywhere">{arg.name}</dt>
                    <dd className="min-w-0">
                        <p className="mono text-[13px] leading-[1.6] whitespace-pre-wrap text-ink-bright wrap-anywhere">
                            {arg.value}
                        </p>
                        <Flags arg={arg} />
                    </dd>
                </div>
            ))}
        </dl>
    );
}

// Only what needs a second look: a model-generated value or an untrusted origin.
function Flags({ arg }: { arg: ApprovalArgDetail }) {
    if (arg.generated) {
        return (
            <p className="mt-[6px] flex items-center gap-[6px] text-[12px] text-ink-alert">
                <WarningGlyph size={14} className="shrink-0 text-warning" />
                model-generated
            </p>
        );
    }
    const untrusted = arg.origins.filter((label) => label.trust === "untrusted");
    if (untrusted.length === 0) return null;
    return (
        <ul aria-label={`Untrusted origins of ${arg.name}`} className="mt-[6px] flex flex-wrap gap-[6px]">
            {untrusted.map((label) => (
                <li key={label.origin} className="max-w-full">
                    <LabelChip label={label} />
                </li>
            ))}
        </ul>
    );
}
