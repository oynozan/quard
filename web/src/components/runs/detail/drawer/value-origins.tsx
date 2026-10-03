import { WarningGlyph } from "@/components/icons/glyphs";
import { LabelChip } from "@/components/kit/labels";
import { Absent } from "@/components/kit/detail/detail-list";
import type { StepArg } from "@/lib/data/runs/types";
import { formatOffset } from "../lib/words";

const MATCH_WORD = { exact: "exact match", inside: "found inside", host: "same host", domain: "same domain" };

function Marker({ children, warn }: { children: string; warn?: boolean }) {
    return (
        <span className="inline-flex items-center gap-[6px]">
            {warn ? <WarningGlyph size={13} className="text-warning" /> : null}
            <span className={warn ? "text-ink-2" : "text-ink-muted"}>{children}</span>
        </span>
    );
}

// Each argument with its value label: where the value first appeared, or that the model wrote it.
export function ValueOrigins({ args, startedAt }: { args: StepArg[]; startedAt: number }) {
    if (args.length === 0) return <Absent>No arguments</Absent>;
    return (
        <ul className="grid gap-[14px]">
            {args.map((arg) => {
                const label = arg.valueLabel;
                const first = label.appearances[0];
                return (
                    <li key={arg.name} className="border-b border-line pb-[14px] last:border-b-0 last:pb-0">
                        <div className="flex items-baseline justify-between gap-3">
                            <span className="mono text-[12px] text-ink-muted">{arg.name}</span>
                            <span className="text-[11px] font-light text-ink-faint">
                                {label.kind}
                                {arg.masked ? " · masked" : ""}
                            </span>
                        </div>
                        <p className="mono mt-1 text-[13px] leading-[1.55] text-ink wrap-anywhere">{arg.value}</p>
                        <div className="mt-2 text-[12px] leading-[1.6] text-ink-note">
                            {!label.traced ? (
                                <Marker>not traced</Marker>
                            ) : label.generated || !first ? (
                                <Marker warn>model-generated</Marker>
                            ) : (
                                <div className="grid gap-[6px]">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span>First seen in</span>
                                        <LabelChip label={first.label} />
                                    </div>
                                    <span className="mono text-[11px] text-ink-muted">
                                        {first.agent} · {formatOffset(first.at - startedAt)} · {MATCH_WORD[first.match]}
                                        {label.appearances.length > 1 ? ` · +${label.appearances.length - 1} more` : ""}
                                    </span>
                                </div>
                            )}
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}
