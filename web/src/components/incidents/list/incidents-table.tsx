"use client";

import { useMemo, useState } from "react";
import { Siren } from "lucide-react";
import { Absent } from "@/components/kit/detail/detail-list";
import { DataTable, NameCell, TableState, Td, Th, Tr } from "@/components/kit/data-table";
import { Badge, StatusSquare } from "@/components/kit/labels";
import { RowChevron, RowLink } from "@/components/kit/links";
import { Toolbar, ToolbarSpacer } from "@/components/kit/table/toolbar";
import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/ui/search-field";
import { Select } from "@/components/ui/select";
import { formatAge, formatShortDate } from "@/lib/format";
import type { Incident, ReplayStatus } from "@/lib/data/types";
import { CATEGORIES, REPLAY_TONE, REPLAY_WORD, sentenceCase } from "../lib/labels";

type Props = { incidents: Incident[]; now: number; initialCategory: string };

const ALL = "all";

function matches(incident: Incident, query: string): boolean {
    if (!query) return true;
    const text = [
        incident.id,
        incident.title,
        incident.entryPoint,
        incident.damage,
        incident.entryAgent,
        incident.damageAgent,
    ];
    return text.join(" ").toLowerCase().includes(query);
}

// Keeps the filter in the address bar without a server round trip.
function writeUrl(category: string) {
    try {
        const url = new URL(window.location.href);
        if (category === ALL) url.searchParams.delete("category");
        else url.searchParams.set("category", category);
        window.history.replaceState(null, "", url);
    } catch {
        // The filter still works without the address bar.
    }
}

export function IncidentsTable({ incidents, now, initialCategory }: Props) {
    const [category, setCategory] = useState(initialCategory);
    const [replay, setReplay] = useState<string>(ALL);
    const [query, setQuery] = useState("");

    const counts = useMemo(() => {
        const map = new Map<string | null, number>();
        for (const item of incidents) map.set(item.category, (map.get(item.category) ?? 0) + 1);
        return map;
    }, [incidents]);

    const rows = useMemo(() => {
        const q = query.trim().toLowerCase();
        return incidents.filter(
            (item) =>
                (category === ALL || item.category === category) &&
                (replay === ALL || item.replay === replay) &&
                matches(item, q),
        );
    }, [incidents, category, replay, query]);

    const filtered = category !== ALL || replay !== ALL || query.trim() !== "";
    const clear = () => {
        setCategory(ALL);
        setReplay(ALL);
        setQuery("");
        writeUrl(ALL);
    };

    const categoryOptions = [
        { value: ALL, label: "All categories" },
        ...CATEGORIES.map((value) => ({
            value,
            label: `${sentenceCase(value)} (${counts.get(value) ?? 0})`,
        })),
    ];
    const replayOptions = [
        { value: ALL, label: "Any replay" },
        ...(Object.keys(REPLAY_WORD) as ReplayStatus[]).map((value) => ({ value, label: REPLAY_WORD[value] })),
    ];

    return (
        <section aria-label="Incident list">
            <Toolbar>
                <SearchField
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search incidents, agents, tools"
                    aria-label="Search incidents"
                />
                <Select
                    size="compact"
                    aria-label="Category"
                    options={categoryOptions}
                    value={category}
                    onValueChange={(value) => {
                        setCategory(value);
                        writeUrl(value);
                    }}
                />
                <Select
                    size="compact"
                    aria-label="Replay status"
                    options={replayOptions}
                    value={replay}
                    onValueChange={setReplay}
                />
                <ToolbarSpacer />
                <p role="status" aria-live="polite" className="text-[12px] text-ink-muted">
                    <span className="mono text-ink-2">{rows.length}</span> of{" "}
                    <span className="mono text-ink-2">{incidents.length}</span>
                </p>
            </Toolbar>

            <DataTable minWidth={960}>
                <colgroup>
                    <col style={{ width: "24%" }} />
                    <col style={{ width: "11%" }} />
                    <col style={{ width: "16%" }} />
                    <col style={{ width: "16%" }} />
                    <col style={{ width: "12%" }} />
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "7%" }} />
                </colgroup>
                <thead>
                    <tr>
                        <Th>Incident</Th>
                        <Th>Category</Th>
                        <Th>Entry point</Th>
                        <Th>Damage</Th>
                        <Th>Agents</Th>
                        <Th>Replay</Th>
                        <Th>Opened</Th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((incident) => (
                        <IncidentRow key={incident.id} incident={incident} now={now} />
                    ))}
                </tbody>
            </DataTable>

            {rows.length === 0 ? (
                filtered ? (
                    <TableState
                        title="No incidents match"
                        action={
                            <Button variant="outline" size="sm" onClick={clear}>
                                Clear filters
                            </Button>
                        }
                    />
                ) : (
                    <TableState title="No incidents yet" body="Blocked or flagged harm opens one here." />
                )
            ) : null}
        </section>
    );
}

function IncidentRow({ incident, now }: { incident: Incident; now: number }) {
    // Before the verdict is found, its cells show a dash
    const entry = incident.entryPoint ?? "—";
    const damage = incident.damage ?? "—";
    const agents =
        incident.entryAgent === incident.damageAgent
            ? (incident.entryAgent ?? "—")
            : `${incident.entryAgent} → ${incident.damageAgent}`;
    return (
        <Tr interactive>
            <Td>
                <RowLink href={`/incidents/${incident.id}`} title={incident.title}>
                    <NameCell icon={<Siren size={18} strokeWidth={0.75} />} name={incident.title} />
                </RowLink>
            </Td>
            <Td>{incident.category ? <Badge>{incident.category}</Badge> : <Absent>—</Absent>}</Td>
            <Td className="truncate text-[12px] text-ink-2" title={entry}>
                <span className="mono">{entry}</span>
            </Td>
            <Td className="truncate text-[12px] text-ink-2" title={damage}>
                {damage}
            </Td>
            <Td className="truncate text-[12px] text-ink-2" title={agents}>
                <span className="mono">{agents}</span>
            </Td>
            <Td>
                <span className="inline-flex items-center gap-2 text-[12px] text-ink-2">
                    <StatusSquare tone={REPLAY_TONE[incident.replay]} />
                    {REPLAY_WORD[incident.replay]}
                </span>
            </Td>
            <Td className="text-[12px] whitespace-nowrap text-ink-2" title={formatShortDate(incident.openedAt)}>
                <span className="mono">{formatAge(incident.openedAt, now)}</span>
                <RowChevron />
            </Td>
        </Tr>
    );
}
