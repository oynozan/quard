import { Glyph } from "@/components/icons/glyphs";
import { ArrowLink, TextLink } from "@/components/kit/links";
import { StatusSquare } from "@/components/kit/labels";
import type { AgentNode } from "@/lib/data/agents";
import { formatAge } from "@/lib/format";
import { STATE_TONE, STATE_WORD } from "../lib/words";

function Dot() {
    return (
        <span aria-hidden className="text-ink-faint">
            ·
        </span>
    );
}

// Breadcrumb, the agent name as the title, its state, its model and when it was last heard from
export function AgentHeading({ agent, now }: { agent: AgentNode; now: number }) {
    return (
        <header className="mb-[26px]">
            <nav aria-label="Breadcrumb" className="mb-[14px] flex items-center gap-[6px] text-[12px] text-ink-muted">
                <TextLink href="/agents">Agents</TextLink>
                <Glyph name="chevronRight" size={12} className="opacity-60" />
                <span aria-current="page" className="mono">
                    {agent.name}
                </span>
            </nav>
            <div className="flex items-start justify-between gap-6 max-[760px]:flex-col max-[760px]:gap-[14px]">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <h1 className="mono text-[24px] leading-[1.3] font-normal break-all text-ink-bright max-[760px]:text-[22px]">
                            {agent.name}
                        </h1>
                        <span className="inline-flex items-center gap-2 text-[12px] text-ink-2">
                            <StatusSquare tone={STATE_TONE[agent.state]} />
                            {STATE_WORD[agent.state]}
                        </span>
                    </div>
                    <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-light text-ink-muted">
                        {agent.model ? (
                            <>
                                <span className="mono text-ink-2">{agent.model}</span>
                                <Dot />
                            </>
                        ) : null}
                        <span>
                            seen <span className="mono text-ink-2">{formatAge(agent.lastSeenAt, now)}</span> ago
                        </span>
                    </p>
                </div>
                <ArrowLink href={`/runs?agent=${encodeURIComponent(agent.name)}`} className="mt-2 shrink-0">
                    View runs
                </ArrowLink>
            </div>
        </header>
    );
}
