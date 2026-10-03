import Link from "next/link";
import { RowChevron } from "@/components/kit/links";
import { StatusSquare } from "@/components/kit/labels";
import { Pane } from "@/components/kit/pane";
import type { AgentNode } from "@/lib/data/agents";
import { formatInt } from "@/lib/format";
import { STATE_TONE, STATE_WORD } from "../lib/words";

const ORDER = { running: 0, idle: 1 };

// Every agent on one line with its state and runs; each row opens the agent page
export function AgentRoster({ agents }: { agents: AgentNode[] }) {
    const sorted = [...agents].sort((a, b) => ORDER[a.state] - ORDER[b.state] || b.runs24h - a.runs24h);
    return (
        <Pane title="Agents" tag={String(agents.length)}>
            <ul>
                {sorted.map((agent) => (
                    <li key={agent.name} className="border-b border-line last:border-b-0">
                        <Link
                            href={`/agents/${encodeURIComponent(agent.name)}`}
                            className="group/row grid cursor-pointer grid-cols-[6px_minmax(0,1fr)_auto_16px] items-center gap-x-[10px] px-3 py-[11px] outline-none transition-colors hover:bg-nav-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-signal"
                        >
                            <StatusSquare tone={STATE_TONE[agent.state]} />
                            <span className="mono truncate text-[13px] text-ink group-hover/row:text-ink-bright">
                                {agent.name}
                                <span className="sr-only">, {STATE_WORD[agent.state]}</span>
                            </span>
                            <span className="text-right text-[11px] font-light text-ink-faint">
                                <span className="mono text-ink-muted">{formatInt(agent.runs24h)}</span>{" "}
                                {agent.runs24h === 1 ? "run" : "runs"} 24h
                            </span>
                            <RowChevron className="ml-0" />
                        </Link>
                    </li>
                ))}
            </ul>
        </Pane>
    );
}
