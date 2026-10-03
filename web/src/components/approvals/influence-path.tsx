import { LabelChip } from "@/components/kit/labels";
import type { PathNode, Trust } from "@/lib/data/types";
import { formatClock } from "@/lib/format";
import { cn } from "@/lib/utils";

const NODE_FILL: Record<Trust, string> = {
    untrusted: "bg-caution-text",
    trusted: "bg-chart-context",
};

const LINK_FILL: Record<Trust, string> = {
    untrusted: "fill-caution-border",
    trusted: "fill-line-strong",
};

// A column of 4px cells with the 2px gap, drawn as one pattern so it fills any height.
function CellLink({ trust, id }: { trust: Trust; id: string }) {
    return (
        <svg
            aria-hidden
            width="4"
            height="100%"
            className="absolute inset-y-0 left-1/2 -ml-[2px]"
            shapeRendering="crispEdges"
        >
            <defs>
                <pattern id={id} width="4" height="6" patternUnits="userSpaceOnUse">
                    <rect width="4" height="4" className={LINK_FILL[trust]} />
                </pattern>
            </defs>
            <rect width="4" height="100%" fill={`url(#${id})`} />
        </svg>
    );
}

// Show the chip where untrusted content enters, and on this call. Square colors carry the rest.
function showChip(nodes: PathNode[], index: number): boolean {
    const node = nodes[index];
    if (node.label.trust !== "untrusted") return false;
    const previous = nodes[index - 1];
    return index === nodes.length - 1 || previous?.label.origin !== node.label.origin;
}

// From the entry point to this call. Squares and links take the trust of the content they carry.
export function InfluencePath({ nodes, waiting, pathId }: { nodes: PathNode[]; waiting: boolean; pathId: string }) {
    return (
        <ol aria-label={`Influence path, ${nodes.length} steps from entry point to this call`}>
            {nodes.map((node, index) => {
                const last = index === nodes.length - 1;
                const next = nodes[index + 1];
                return (
                    <li key={`${node.stepId}-${index}`} className="grid grid-cols-[16px_minmax(0,1fr)] gap-x-3">
                        <div className="flex flex-col items-center pt-[6px]">
                            <span
                                aria-hidden
                                className={cn(
                                    "size-2 shrink-0",
                                    last
                                        ? waiting
                                            ? "bg-warning"
                                            : "border border-line-strong"
                                        : NODE_FILL[node.label.trust],
                                )}
                            />
                            {next ? (
                                <div className="relative mt-[6px] mb-1 min-h-3 w-full flex-1">
                                    <CellLink trust={next.label.trust} id={`${pathId}-${index}`} />
                                </div>
                            ) : null}
                        </div>
                        <div className={cn("min-w-0", !last && "pb-4")}>
                            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3">
                                <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                    <span className="mono text-[11px] text-ink-faint">{node.kind}</span>
                                    <span
                                        className={cn(
                                            "text-[13px] text-ink wrap-anywhere",
                                            node.kind === "call" && "mono",
                                        )}
                                    >
                                        {node.title}
                                    </span>
                                    {showChip(nodes, index) ? (
                                        <LabelChip label={node.label} />
                                    ) : (
                                        <span className="sr-only">{node.label.trust}</span>
                                    )}
                                </p>
                                <time className="mono text-[11px] text-ink-faint">{formatClock(node.at, true)}</time>
                            </div>
                        </div>
                    </li>
                );
            })}
        </ol>
    );
}
