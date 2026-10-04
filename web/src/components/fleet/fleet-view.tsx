import type { ReactNode } from "react";
import { PageHeading } from "@/components/kit/headings";
import { PAGE_WIDE } from "@/components/kit/page";
import { Skeleton } from "@/components/ui/skeleton";
import { PayeesPanes } from "@/components/payments/summary/payees-panes";
import { SpendPanes } from "@/components/payments/summary/spend-panes";
import type { FleetData, QuarantineData } from "@/lib/data/fleet";
import type { SpendData } from "@/lib/data/payments/types";
import { formatShortDate } from "@/lib/format";
import { AgentPanes } from "./agent-panes";
import { BlocksPanes } from "./blocks-panes";
import { IncidentPanes } from "./incident-panes";
import { QuarantineSection } from "./quarantine/quarantine-section";
import { QuarantineSkeleton } from "./quarantine/quarantine-skeleton";
import { RunLimits } from "./run-limits";

// The overview's container, so every page shares one gutter
export function FleetContainer({ children }: { children: ReactNode }) {
    return <div className={PAGE_WIDE}>{children}</div>;
}

type FleetViewProps = { fleet: FleetData | null; quarantine: QuarantineData | null; spend: SpendData | null };

// The summary page, loading while its data is null
export function FleetView({ fleet, quarantine, spend }: FleetViewProps) {
    return (
        <FleetContainer>
            <PageHeading
                title="Summary"
                actions={
                    <span className="inline-flex items-center gap-2 text-[12px] font-light text-ink-muted">
                        Last 30 days
                        {fleet ? (
                            <span className="mono text-ink-2">
                                {formatShortDate(fleet.startAt)} – {formatShortDate(fleet.endAt)}
                            </span>
                        ) : (
                            <Skeleton width={96} height={10} />
                        )}
                    </span>
                }
            />
            <div className="grid grid-cols-1 gap-[34px] max-[760px]:gap-[28px]">
                <Reveal delay={0}>
                    <IncidentPanes fleet={fleet} />
                </Reveal>
                <Reveal delay={40}>
                    <BlocksPanes byGuard={fleet?.blocksByGuard ?? null} heatmap={fleet?.blocksHeatmap ?? null} />
                </Reveal>
                <Reveal delay={80}>
                    <AgentPanes fleet={fleet} />
                </Reveal>
                <Reveal delay={120}>
                    <RunLimits limits={fleet?.runLimits ?? null} />
                </Reveal>
                <Reveal delay={160}>
                    <div className="grid grid-cols-1 gap-[34px] max-[760px]:gap-[28px]">
                        <SpendPanes spend={spend} />
                        <PayeesPanes spend={spend} />
                    </div>
                </Reveal>
                <Reveal delay={200}>
                    {quarantine ? (
                        <QuarantineSection
                            quarantine={quarantine.quarantine}
                            watching={quarantine.watching}
                            check={quarantine.check}
                            now={quarantine.now}
                        />
                    ) : (
                        <QuarantineSkeleton />
                    )}
                </Reveal>
            </div>
        </FleetContainer>
    );
}

function Reveal({ delay, children }: { delay: number; children: ReactNode }) {
    return (
        <div className="reveal min-w-0" style={{ animationDelay: `${delay}ms` }}>
            {children}
        </div>
    );
}
