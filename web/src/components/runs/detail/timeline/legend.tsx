import type { Step } from "@/lib/data/runs/types";
import { CONTEXTS } from "../lib/context";
import { MARK_WORD, stepMark, type MarkKind } from "../lib/words";

function Swatch({ fill, hole }: { fill: string; hole: boolean }) {
    return (
        <svg aria-hidden width={10} height={10} shapeRendering="crispEdges" className="shrink-0">
            <rect width={10} height={10} fill={fill} />
            {hole ? <rect x={4} y={4} width={2} height={2} fill="var(--page)" /> : null}
        </svg>
    );
}

function MarkSwatch({ kind }: { kind: MarkKind }) {
    const color = kind === "block" || kind === "would-block" ? "var(--danger)" : "var(--warning)";
    const outlined = kind.startsWith("would");
    return (
        <svg aria-hidden width={10} height={5} shapeRendering="crispEdges" className="shrink-0">
            {outlined ? (
                <rect x={0.5} y={0.5} width={9} height={4} fill="none" stroke={color} />
            ) : (
                <rect width={10} height={5} fill={color} />
            )}
        </svg>
    );
}

// Context colors first, then the decision marks this run actually has.
export function TimelineLegend({ steps }: { steps: Step[] }) {
    const kinds = (["block", "ask", "would-block", "would-ask"] as MarkKind[]).filter((kind) =>
        steps.some((step) => stepMark(step) === kind),
    );
    return (
        <div className="flex flex-wrap items-center gap-x-[18px] gap-y-2 text-[11px] font-light text-ink-muted">
            <span className="sr-only">Legend:</span>
            {CONTEXTS.map((context) => (
                <span key={context.key} className="inline-flex items-center gap-[7px]">
                    <Swatch fill={context.fill} hole={context.untrusted} />
                    {context.word}
                </span>
            ))}
            {kinds.length ? <span aria-hidden className="h-3 w-px bg-line" /> : null}
            {kinds.map((kind) => (
                <span key={kind} className="inline-flex items-center gap-[7px]">
                    <MarkSwatch kind={kind} />
                    {MARK_WORD[kind]}
                </span>
            ))}
        </div>
    );
}
