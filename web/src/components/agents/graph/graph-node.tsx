import Link from "next/link";
import type { CSSProperties } from "react";
import { Glyph } from "@/components/icons/glyphs";
import type { AgentNode, AgentState } from "@/lib/data/agents";
import { cn } from "@/lib/utils";
import { SQUARE, type Orientation, type PlacedNode } from "../lib/graph-geometry";
import { STATE_WORD } from "../lib/words";

const SQUARE_STYLE: Record<AgentState, string> = { running: "bg-signal", idle: "bg-chart-context" };

const LABEL_WIDTH = 104;

function placement(node: PlacedNode, orientation: Orientation, width: number, height: number): CSSProperties {
    const half = SQUARE / 2;
    if (orientation === "across") {
        const top = node.y - 17;
        return node.side === "before" ? { right: width - (node.x + half), top } : { left: node.x - half, top };
    }
    const left = node.x - LABEL_WIDTH / 2;
    return node.side === "before"
        ? { left, width: LABEL_WIDTH, bottom: height - (node.y + half) }
        : { left, width: LABEL_WIDTH, top: node.y - half };
}

// The resting cue that a node opens a page. It sits on the shorter line when space is tight.
function Chevron() {
    return (
        <Glyph
            name="chevronRight"
            size={12}
            aria-hidden
            className="shrink-0 text-ink-faint transition-colors group-hover:text-ink-bright"
        />
    );
}

type GraphNodeProps = {
    node: PlacedNode;
    agent: AgentNode;
    orientation: Orientation;
    width: number;
    height: number;
    dim: boolean;
    onFocus(): void;
    onBlur(): void;
};

// One agent as a square node with its name; the whole node is the link to the agent page
export function GraphNode({ node, agent, orientation, width, height, dim, onFocus, onBlur }: GraphNodeProps) {
    const across = orientation === "across";
    const before = node.side === "before";
    return (
        <li className="contents">
            <Link
                href={`/agents/${encodeURIComponent(agent.name)}`}
                aria-label={[agent.name, STATE_WORD[agent.state].toLowerCase(), agent.model].filter(Boolean).join(", ")}
                onMouseEnter={onFocus}
                onMouseLeave={onBlur}
                onFocus={onFocus}
                onBlur={onBlur}
                style={placement(node, orientation, width, height)}
                className={cn(
                    "group absolute z-[1] flex cursor-pointer items-center rounded-[2px] outline-none transition-opacity duration-150 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-signal",
                    across ? "h-[34px] gap-[9px]" : "gap-[6px] text-center",
                    across && before && "flex-row-reverse text-right",
                    !across && (before ? "flex-col-reverse" : "flex-col"),
                    dim && "opacity-35",
                )}
            >
                <span
                    aria-hidden
                    className={cn(
                        "shrink-0 outline-offset-2 outline-ink-bright group-hover:outline-1",
                        SQUARE_STYLE[agent.state],
                    )}
                    style={{ width: SQUARE, height: SQUARE }}
                />
                <span className="-mx-1 flex max-w-[calc(100%+8px)] min-w-0 flex-col rounded-[2px] px-1 leading-[1.35] transition-colors group-hover:bg-nav-hover">
                    <span
                        className={cn(
                            "inline-flex min-w-0 items-center gap-[2px] text-[12px] text-ink group-hover:text-ink-bright",
                            across && before && "justify-end",
                            !across && "justify-center",
                        )}
                    >
                        <span className="mono min-w-0 truncate">{agent.name}</span>
                        {across ? <Chevron /> : null}
                    </span>
                    <span
                        className={cn(
                            "inline-flex min-w-0 items-center gap-[2px] text-[11px] text-ink-muted",
                            !across && "justify-center",
                        )}
                    >
                        <span className="mono truncate">{agent.model}</span>
                        {across ? null : <Chevron />}
                    </span>
                </span>
            </Link>
        </li>
    );
}
