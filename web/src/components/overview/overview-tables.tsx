import { Bot, ListTree, Siren } from "lucide-react";
import { OutcomeBar } from "@/components/charts/outcome-bar";
import { DataTable, NameCell, QuietEmpty, Td, Th, Tr } from "@/components/kit/data-table";
import { Absent } from "@/components/kit/detail/detail-list";
import { SectionHeading } from "@/components/kit/headings";
import { RowChevron, RowLink } from "@/components/kit/links";
import { Badge, LabelChip, RunStatusLabel, StatusSquare } from "@/components/kit/labels";
import { formatAge, formatUsd, shortId } from "@/lib/format";
import type { ApprovalRequest, Incident, RunSummary } from "@/lib/data/types";
import { REPLAY_TONE } from "@/components/incidents/lib/labels";
import { costText } from "@/components/runs/detail/lib/cost";

// The overview lists a few requests; the approvals page has them all
const APPROVALS_SHOWN = 5;

type ApprovalsProps = { approvals: ApprovalRequest[]; total: number; now: number };

// total counts every open request, which can be more than the list holds
export function ApprovalsSection({ approvals, total, now }: ApprovalsProps) {
    // Calls that still wait come first, in list order within each group
    const shown = [...approvals].sort((a, b) => Number(b.waiting) - Number(a.waiting)).slice(0, APPROVALS_SHOWN);
    return (
        <section aria-label="Approvals waiting">
            <SectionHeading title="Approvals waiting" count={Math.max(total, approvals.length)} href="/approvals" />
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
                    {shown.map((request) => {
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
            {approvals.length === 0 ? <QuietEmpty>No approvals waiting</QuietEmpty> : null}
        </section>
    );
}

// A run with no guard decisions gets a word instead of an empty bar
const decided = (run: RunSummary) => run.decisions.allowed + run.decisions.asked + run.decisions.blocked > 0;

export function RunsSection({ runs, now }: { runs: RunSummary[]; now: number }) {
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
            {runs.length === 0 ? <QuietEmpty>No runs yet</QuietEmpty> : null}
        </section>
    );
}

export function IncidentsSection({ incidents, now }: { incidents: Incident[]; now: number }) {
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
            {incidents.length === 0 ? <QuietEmpty>No incidents yet</QuietEmpty> : null}
        </section>
    );
}
