"use client";

import { useState } from "react";
import { DataTable, NameCell, TableState, Td, Th, Tr } from "@/components/kit/data-table";
import { SectionHeading } from "@/components/kit/headings";
import { RowChevron, RowLink } from "@/components/kit/links";
import { StatusSquare } from "@/components/kit/labels";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import type { ApprovalDecision } from "@/lib/data/approvals/types";
import { formatAge, formatClock, shortId } from "@/lib/format";
import { ANSWER_WORD } from "./lib/model";

type Filter = "all" | "approved" | "denied";

type Props = { decisions: ApprovalDecision[]; now: number; fresh: Set<string> };

// Past answers. Only the argument hash is kept once a request is decided.
export function DecisionsTable({ decisions, now, fresh }: Props) {
    const [filter, setFilter] = useState<Filter>("all");
    const denied = decisions.filter((item) => item.answer === "deny");
    const approved = decisions.filter((item) => item.answer !== "deny");
    const rows = filter === "all" ? decisions : filter === "denied" ? denied : approved;

    return (
        <section aria-label="Decided" className="min-w-0">
            <SectionHeading
                title="Decided"
                count={decisions.length}
                action={
                    <Segmented
                        size="sm"
                        aria-label="Show decisions"
                        value={filter}
                        onValueChange={(value) => setFilter(value as Filter)}
                        options={[
                            { value: "all", label: "All", count: decisions.length },
                            { value: "approved", label: "Approved", count: approved.length },
                            { value: "denied", label: "Denied", count: denied.length },
                        ]}
                    />
                }
            />
            <DataTable minWidth={880}>
                <colgroup>
                    <col style={{ width: "24%" }} />
                    <col style={{ width: "13%" }} />
                    <col style={{ width: "16%" }} />
                    <col style={{ width: "19%" }} />
                    <col style={{ width: "16%" }} />
                    <col style={{ width: "12%" }} />
                </colgroup>
                <thead>
                    <tr>
                        <Th>Request</Th>
                        <Th>Run</Th>
                        <Th>Answer</Th>
                        <Th>Decided by</Th>
                        <Th>Argument hash</Th>
                        <Th>Decided</Th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((item) => (
                        <Tr key={`${item.requestId}-${item.decidedAt}`} interactive>
                            <Td>
                                <span
                                    id={fresh.has(item.requestId) ? item.requestId : undefined}
                                    className="scroll-mt-6"
                                >
                                    <RowLink href={`/runs/${item.runId}`} aria-label={`Open run ${item.runId}`}>
                                        <NameCell name={<span className="mono">{item.tool}</span>} sub={item.agent} />
                                    </RowLink>
                                </span>
                            </Td>
                            <Td>
                                <span className="mono text-[12px] text-ink-2">{shortId(item.runId)}</span>
                            </Td>
                            <Td>
                                <span className="inline-flex items-center gap-2 text-[12px] text-ink-2">
                                    <StatusSquare tone={item.answer === "deny" ? "off" : "on"} />
                                    {ANSWER_WORD[item.answer]}
                                </span>
                            </Td>
                            <Td className="overflow-hidden">
                                <span className="block truncate text-[12px] text-ink-2" title={item.by}>
                                    {item.by}
                                </span>
                            </Td>
                            <Td>
                                <span className="mono block truncate text-[12px] text-ink-muted" title={item.argsHash}>
                                    {item.argsHash.slice(0, 12)}
                                </span>
                            </Td>
                            <Td>
                                <span className="flex items-center justify-between">
                                    <span className="min-w-0">
                                        <span className="block text-[12px] text-ink-2">
                                            {fresh.has(item.requestId) ? (
                                                "Just now"
                                            ) : (
                                                <>
                                                    <span className="mono">{formatAge(item.decidedAt, now)}</span> ago
                                                </>
                                            )}
                                        </span>
                                        <span className="mono block text-[11px] text-ink-note">
                                            {formatClock(item.decidedAt)} UTC
                                        </span>
                                    </span>
                                    <RowChevron />
                                </span>
                            </Td>
                        </Tr>
                    ))}
                </tbody>
            </DataTable>
            {rows.length === 0 ? (
                <div className="border-b border-line">
                    {decisions.length === 0 ? (
                        <TableState title="No decisions yet" />
                    ) : (
                        <TableState
                            title={filter === "denied" ? "No denied requests" : "No approved requests"}
                            action={
                                <Button size="sm" onClick={() => setFilter("all")}>
                                    Show all
                                </Button>
                            }
                        />
                    )}
                </div>
            ) : null}
        </section>
    );
}
