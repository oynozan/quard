"use client";

import { useState } from "react";
import { DataTable, NameCell, TableState, Td, Th, Tr } from "@/components/kit/data-table";
import { SectionHeading } from "@/components/kit/headings";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import type { AlwaysGrant } from "@/lib/data/approvals/types";
import { formatAge, formatInt, formatShortDate } from "@/lib/format";
import { argsLine } from "./lib/model";
import { RevokeCell } from "./revoke-cell";

type Filter = "active" | "revoked";

type Props = { grants: AlwaysGrant[]; now: number; onRevoke(grant: AlwaysGrant): void };

// Standing "always approve" grants. Each one is bound to an agent, a tool and an argument hash.
export function GrantsTable({ grants, now, onRevoke }: Props) {
    const [filter, setFilter] = useState<Filter>("active");
    const active = grants.filter((grant) => grant.revokedAt === null);
    const revoked = grants.filter((grant) => grant.revokedAt !== null);
    const rows = filter === "active" ? active : revoked;

    return (
        <section aria-label="Always approve grants" className="min-w-0">
            <SectionHeading
                title="Always approve"
                count={active.length}
                action={
                    <Segmented
                        size="sm"
                        aria-label="Show grants"
                        value={filter}
                        onValueChange={(value) => setFilter(value as Filter)}
                        options={[
                            { value: "active", label: "Active", count: active.length },
                            { value: "revoked", label: "Revoked", count: revoked.length },
                        ]}
                    />
                }
            />
            <DataTable minWidth={880}>
                <colgroup>
                    <col style={{ width: "22%" }} />
                    <col style={{ width: "27%" }} />
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "15%" }} />
                    <col style={{ width: "10%" }} />
                    <col style={{ width: "12%" }} />
                </colgroup>
                <thead>
                    <tr>
                        <Th>Grant</Th>
                        <Th>Arguments</Th>
                        <Th>Argument hash</Th>
                        <Th>Approved by</Th>
                        <Th>Used</Th>
                        <Th>
                            <span className="sr-only">Actions</span>
                        </Th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((grant) => {
                        const line = argsLine(grant.args);
                        return (
                            <Tr key={grant.id}>
                                <Td>
                                    <NameCell name={<span className="mono">{grant.tool}</span>} sub={grant.agent} />
                                </Td>
                                <Td className="overflow-hidden">
                                    <span className="mono block truncate text-[12px] text-ink-2" title={line}>
                                        {line}
                                    </span>
                                </Td>
                                <Td>
                                    <span
                                        className="mono block truncate text-[12px] text-ink-muted"
                                        title={grant.argsHash}
                                    >
                                        {grant.argsHash.slice(0, 12)}
                                    </span>
                                </Td>
                                <Td className="overflow-hidden">
                                    <span className="block truncate text-[12px] text-ink-2" title={grant.approvedBy}>
                                        {grant.approvedBy}
                                    </span>
                                    <span className="mono block text-[11px] text-ink-note">
                                        {formatShortDate(grant.approvedAt)}
                                    </span>
                                </Td>
                                <Td>
                                    <span className="mono block text-[12px] text-ink-2">
                                        {formatInt(grant.timesUsed)}
                                    </span>
                                    <span className="block text-[11px] text-ink-note">
                                        {grant.lastUsedAt === null ? (
                                            <span className="text-ink-absent">Never</span>
                                        ) : (
                                            <>
                                                last <span className="mono">{formatAge(grant.lastUsedAt, now)}</span>{" "}
                                                ago
                                            </>
                                        )}
                                    </span>
                                </Td>
                                <Td>
                                    <RevokeCell grant={grant} now={now} onRevoke={onRevoke} />
                                </Td>
                            </Tr>
                        );
                    })}
                </tbody>
            </DataTable>
            {rows.length === 0 ? (
                <div className="border-b border-line">
                    {filter === "active" ? (
                        <TableState title="No standing grants" />
                    ) : (
                        <TableState
                            title="Nothing revoked"
                            action={
                                <Button size="sm" onClick={() => setFilter("active")}>
                                    Show active grants
                                </Button>
                            }
                        />
                    )}
                </div>
            ) : null}
        </section>
    );
}
