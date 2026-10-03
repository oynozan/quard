import { Bot, ListTree, Siren } from "lucide-react";
import { OutcomeBar } from "@/components/charts/outcome-bar";
import { DataTable, NameCell, Td, Th, Tr } from "@/components/kit/data-table";
import { Absent } from "@/components/kit/detail/detail-list";
import { EmptyLine } from "@/components/kit/empty";
import { SectionHeading } from "@/components/kit/headings";
import { RowChevron, RowLink } from "@/components/kit/links";
import { Badge, LabelChip, RunStatusLabel, StatusSquare } from "@/components/kit/labels";
import { formatAge, formatUsd, shortId } from "@/lib/format";
import type { ApprovalRequest, Incident, RunSummary } from "@/lib/data/types";
import { REPLAY_TONE } from "@/components/incidents/lib/labels";
import { costText } from "@/components/runs/detail/lib/cost";

// A section with nothing to list shows its title and one line
function EmptySection({ title, children }: { title: string; children: string }) {
    return (
        <section aria-label={title}>
            <SectionHeading title={title} />
            <EmptyLine>{children}</EmptyLine>
        </section>
    );
}

export function ApprovalsSection({ approvals, now }: { approvals: ApprovalRequest[]; now: number }) {
    if (approvals.length === 0) return <EmptySection title="Approvals waiting">No approvals waiting</EmptySection>;
    return (
        <section aria-label="Approvals waiting">
            <SectionHeading title="Approvals waiting" count={approvals.length} href="/approvals" />
            <DataTable minWidth={680}>
                <colgroup>
                    <col style={{ width: "30%" }} />
                    <col style={{ width: "40%" }} />
                    <col style={{ width: "16%" }} />
                    <col style={{ width: "14%" }} />
                </colgroup>
                <thead>
                    <tr>
                        <Th>Call</Th>
                        <Th>Influenced by</Th>
                        <Th>Waiting</Th>
                        <Th>
                            <span className="sr-only">Actions</span>
                        </Th>
                    </tr>
                </thead>
                <tbody>
                    {approvals.map((request) => {
                        const untrusted = request.args
                            .flatMap((arg) => arg.origins)
                            .filter((o) => o.trust === "untrusted");
                        return (
                            <Tr key={request.id} interactive>
                                <Td>
                                    <RowLink
                                        href={`/approvals#${request.id}`}
                                        aria-label={`Review ${request.tool} by ${request.agent}`}
                                    >
                                        <NameCell
                                            icon={<Bot size={18} strokeWidth={0.75} />}
                                            name={<span className="mono">{request.tool}</span>}
                                            sub={`${request.agent} · run ${shortId(request.runId)}`}
                                        />
                                    </RowLink>
                                </Td>
                                <Td className="overflow-hidden">
                                    {untrusted.length > 0 ? (
                                        <span className="flex gap-[6px] overflow-hidden">
                                            <LabelChip label={untrusted[0]} />
                                        </span>
                                    ) : (
                                        <span className="text-[12px] text-ink-absent">Trusted sources only</span>
                                    )}
                                </Td>
                                <Td className="text-[12px] text-ink-2">
                                    {request.waiting ? (
                                        formatAge(request.openedAt, now)
                                    ) : (
                                        <span className="text-ink-absent">No longer waiting</span>
                                    )}
                                </Td>
                                <Td className="text-[13px] text-ink-link group-hover/row:text-ink-bright">
                                    Review
                                    <RowChevron />
                                </Td>
                            </Tr>
                        );
                    })}
                </tbody>
            </DataTable>
        </section>
    );
}

// A run with no guard decisions gets a word instead of an empty bar
const decided = (run: RunSummary) => run.decisions.allowed + run.decisions.asked + run.decisions.blocked > 0;

export function RunsSection({ runs, now }: { runs: RunSummary[]; now: number }) {
    if (runs.length === 0) return <EmptySection title="Recent runs">No runs yet</EmptySection>;
    return (
        <section aria-label="Recent runs">
            <SectionHeading title="Recent runs" count={runs.length} href="/runs" />
            <DataTable minWidth={680}>
                <colgroup>
                    <col style={{ width: "28%" }} />
                    <col style={{ width: "16%" }} />
                    <col style={{ width: "30%" }} />
                    <col style={{ width: "12%" }} />
                    <col style={{ width: "14%" }} />
                </colgroup>
                <thead>
                    <tr>
                        <Th>Run</Th>
                        <Th>Status</Th>
                        <Th>Guard decisions</Th>
                        <Th>Cost</Th>
                        <Th>Started</Th>
                    </tr>
                </thead>
                <tbody>
                    {runs.map((run) => (
                        <Tr key={run.id} interactive>
                            <Td>
                                <RowLink href={`/runs/${run.id}`}>
                                    <NameCell
                                        icon={<ListTree size={18} strokeWidth={0.75} />}
                                        name={run.rootAgent}
                                        sub={
                                            <span className="mono">
                                                {shortId(run.id)} · {run.agents.length}{" "}
                                                {run.agents.length === 1 ? "agent" : "agents"} · {run.steps}{" "}
                                                {run.steps === 1 ? "step" : "steps"}
                                            </span>
                                        }
                                    />
                                </RowLink>
                            </Td>
                            <Td>
                                <RunStatusLabel status={run.status} />
                            </Td>
                            <Td className="text-[12px]">
                                {decided(run) ? (
                                    <OutcomeBar counts={run.decisions} cells={24} />
                                ) : (
                                    <Absent>None yet</Absent>
                                )}
                            </Td>
                            <Td className="mono text-[12px] text-ink-2">
                                {costText(run.costUsd, run.costKnown, formatUsd)}
                            </Td>
                            <Td className="text-[12px] text-ink-2">
                                {formatAge(run.startedAt, now)} ago
                                <RowChevron />
                            </Td>
                        </Tr>
                    ))}
                </tbody>
            </DataTable>
        </section>
    );
}

export function IncidentsSection({ incidents, now }: { incidents: Incident[]; now: number }) {
    if (incidents.length === 0) return <EmptySection title="Incidents">No incidents yet</EmptySection>;
    return (
        <section aria-label="Incidents">
            <SectionHeading title="Incidents" count={incidents.length} href="/incidents" />
            <DataTable minWidth={680}>
                <colgroup>
                    <col style={{ width: "40%" }} />
                    <col style={{ width: "16%" }} />
                    <col style={{ width: "28%" }} />
                    <col style={{ width: "16%" }} />
                </colgroup>
                <thead>
                    <tr>
                        <Th>Incident</Th>
                        <Th>Cause</Th>
                        <Th>Replay</Th>
                        <Th>Opened</Th>
                    </tr>
                </thead>
                <tbody>
                    {incidents.map((incident) => (
                        <Tr key={incident.id} interactive>
                            <Td>
                                <RowLink href={`/incidents/${incident.id}`}>
                                    <NameCell
                                        icon={<Siren size={18} strokeWidth={0.75} />}
                                        name={incident.title}
                                        sub={`${incident.entryAgent} → ${incident.damageAgent} · ${incident.entryPoint}`}
                                    />
                                </RowLink>
                            </Td>
                            <Td>
                                <Badge>{incident.category}</Badge>
                            </Td>
                            <Td>
                                <span className="inline-flex items-center gap-2 text-[12px] text-ink-2">
                                    <StatusSquare tone={REPLAY_TONE[incident.replay]} />
                                    {incident.replay === "running" ? "Replaying" : incident.replay}
                                </span>
                            </Td>
                            <Td className="text-[12px] text-ink-2">
                                {formatAge(incident.openedAt, now)} ago
                                <RowChevron />
                            </Td>
                        </Tr>
                    ))}
                </tbody>
            </DataTable>
        </section>
    );
}
