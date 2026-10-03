import type { CSSProperties } from "react";
import { Pane } from "@/components/kit/pane";
import { LabelChip } from "@/components/kit/labels";
import { formatClock } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PathNode } from "@/lib/data/types";
import { ROLE_WORD } from "../lib/labels";

const KIND_WORD: Record<PathNode["kind"], string> = {
    origin: "Origin",
    agent: "Agent",
    handoff: "Handoff",
    message: "Message",
    memory: "Memory",
    call: "Tool call",
};

// The path from entry point to damage: nodes in time order, joined by cell links.
export function IncidentPath({ path }: { path: PathNode[] }) {
    const untrusted = path.filter((node) => node.label.trust === "untrusted").length;
    return (
        <Pane title="Path from entry point to damage" tag={`${path.length} steps`}>
            {/* Equal columns so the whole path fits one row; links sit in the gaps. */}
            <ol
                aria-label={`${path.length} steps from entry point to damage, ${untrusted} carrying untrusted content`}
                className="table-scroll grid grid-cols-[repeat(var(--steps),minmax(150px,1fr))] gap-x-[34px] p-3 max-[760px]:grid-cols-1 max-[760px]:gap-y-[26px]"
                style={{ "--steps": path.length } as CSSProperties}
            >
                {path.map((node, index) => (
                    <li key={`${node.stepId ?? node.kind}-${index}`} className="relative flex min-w-0">
                        {index > 0 ? <Link /> : null}
                        <Node node={node} index={index} />
                    </li>
                ))}
            </ol>
        </Pane>
    );
}

// Four cells between two nodes, like a trace in the field.
function Link() {
    return (
        <span
            aria-hidden
            className="absolute inset-y-0 right-full flex w-[34px] items-center justify-center gap-[2px] max-[760px]:inset-x-0 max-[760px]:top-auto max-[760px]:bottom-full max-[760px]:h-[26px] max-[760px]:w-auto max-[760px]:flex-col"
        >
            {[0, 1, 2, 3].map((i) => (
                <span key={i} className="size-1 bg-chart-context" />
            ))}
        </span>
    );
}

function Node({ node, index }: { node: PathNode; index: number }) {
    const marked = node.role !== null;
    // Skip the agent line when the title already names the agent.
    const showAgent = node.agent !== null && !node.title.includes(node.agent);
    return (
        <div className={cn("flex w-full min-w-0 flex-col gap-2 p-3", marked ? "bg-nav-hover" : "bg-panel")}>
            <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className={cn("font-light", marked ? "text-ink" : "text-ink-muted")}>
                    <span className="mono mr-[6px] text-ink-faint">{String(index + 1).padStart(2, "0")}</span>
                    {node.role ? ROLE_WORD[node.role] : KIND_WORD[node.kind]}
                </span>
                <span className="mono text-ink-muted">{formatClock(node.at, true)}</span>
            </div>
            <p className="text-[13px] leading-[1.4] break-words text-ink" title={node.detail}>
                {node.title}
            </p>
            <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                {showAgent ? <span className="mono text-[11px] text-ink-2">{node.agent}</span> : null}
                <LabelChip label={node.label} />
            </div>
        </div>
    );
}
