import { FitMeter } from "@/components/charts/fit";
import { StatusSquare } from "@/components/kit/labels";
import type { Agent } from "@/lib/data/types";

const STATE_WORD = { running: "Running", idle: "Idle", offline: "Offline" } as const;

type OverviewRailProps = { agents: Agent[]; guardCounts: { type: string; count: number }[] };

// The sticky summary rail beside the overview tables.
export function OverviewRail({ agents, guardCounts }: OverviewRailProps) {
    const running = agents.filter((agent) => agent.state === "running").length;

    return (
        <aside
            aria-label="Fleet summary"
            className="sticky top-6 self-start rounded-md bg-panel max-[980px]:static max-[980px]:grid max-[980px]:grid-cols-2 max-[760px]:block"
        >
            <section className="border-b border-line p-[18px] max-[1180px]:p-[15px] max-[980px]:border-r max-[980px]:border-b-0 max-[760px]:border-r-0 max-[760px]:border-b">
                <h2 className="mb-4 text-[13px] font-light">Agents</h2>
                <div className="mb-[18px]">
                    <div className="mb-[10px] flex items-baseline justify-between gap-[10px] text-[12px] text-ink-muted">
                        <span>Running</span>
                        <span className="mono">
                            {running} / {agents.length}
                        </span>
                    </div>
                    <FitMeter
                        value={running}
                        max={agents.length}
                        cells={22}
                        initial={230}
                        label={`${running} of ${agents.length} agents running`}
                    />
                </div>
                <ul className="grid gap-3 text-[12px]">
                    {agents.map((agent) => (
                        <li key={agent.name} className="flex items-center gap-[9px]">
                            <StatusSquare tone={agent.state === "running" ? "on" : "off"} />
                            <span
                                className={`mono truncate ${agent.state === "running" ? "text-ink-muted" : "text-ink-subtle"}`}
                            >
                                {agent.name}
                            </span>
                            <span className="ml-auto text-ink-subtle">
                                {agent.state === "running" ? agent.version : STATE_WORD[agent.state]}
                            </span>
                        </li>
                    ))}
                </ul>
            </section>

            <section className="p-[18px] max-[1180px]:p-[15px]">
                <h2 className="mb-4 text-[13px] font-light">Guards</h2>
                <dl className="grid gap-[10px] text-[12px] text-ink-muted">
                    {guardCounts.map((row) => (
                        <div key={row.type} className="flex items-baseline justify-between gap-[10px]">
                            <dt className="mono">{row.type}</dt>
                            <dd className="mono">{row.count.toLocaleString("en-US")}</dd>
                        </div>
                    ))}
                </dl>
            </section>
        </aside>
    );
}
