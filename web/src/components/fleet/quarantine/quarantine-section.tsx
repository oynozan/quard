"use client";

import { useEffect, useRef, useState } from "react";
import { CountChip } from "@/components/kit/headings";
import { TableState } from "@/components/kit/data-table";
import { Toolbar } from "@/components/kit/table/toolbar";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { showToast } from "@/components/ui/toast";
import type { FleetData, QuarantinedValue } from "@/lib/data/fleet";
import { MarkKnownDrawer } from "./mark-known-drawer";
import { QuarantineTable } from "./quarantine-table";
import { KIND_NAMES } from "./value-cell";
import { WatchingTable } from "./watching-table";

type Kind = "all" | QuarantinedValue["kind"];

const KINDS: Kind[] = ["all", "iban", "email", "domain"];
// The kind filter only helps once the list is long
const FILTER_FROM = 6;
const PLURALS = { all: "values", iban: "IBANs", email: "email addresses", domain: "domains" };

type QuarantineSectionProps = {
    quarantine: QuarantinedValue[];
    watching: FleetData["watching"];
    check: FleetData["fleetCheck"];
    now: number;
};

// The fleet-check quarantine list with a local "Mark as known" action
export function QuarantineSection({ quarantine, watching, check, now }: QuarantineSectionProps) {
    const [rows, setRows] = useState(quarantine);
    const [kind, setKind] = useState<Kind>("all");
    const [picked, setPicked] = useState<QuarantinedValue | null>(null);
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [announcement, setAnnouncement] = useState("");
    const headingRef = useRef<HTMLDivElement>(null);
    const timers = useRef<number[]>([]);

    useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), []);

    const filtering = rows.length > FILTER_FROM;
    const shown = !filtering || kind === "all" ? rows : rows.filter((row) => row.kind === kind);
    const options = KINDS.map((value) => ({
        value,
        label: value === "all" ? "All" : KIND_NAMES[value],
        count: value === "all" ? rows.length : rows.filter((row) => row.kind === value).length,
    }));

    function pick(row: QuarantinedValue) {
        setPicked(row);
        setOpen(true);
    }

    function confirm() {
        if (!picked) return;
        const done = picked;
        setBusy(true);
        // Stands in for the request until the backend exists
        timers.current.push(
            window.setTimeout(() => {
                const left = rows.filter((row) => row.hash !== done.hash);
                setRows(left);
                setBusy(false);
                setOpen(false);
                showToast(`${done.value} marked as known`);
                setAnnouncement(`${done.value} marked as known. ${left.length} left in quarantine.`);
                timers.current.push(window.setTimeout(() => headingRef.current?.focus(), 260));
            }, 650),
        );
    }

    return (
        <section aria-label="Quarantine">
            <div ref={headingRef} tabIndex={-1} className="mb-4 outline-none">
                <h2 className="text-[15px] leading-[1.4] font-extralight max-[760px]:text-[14px]">
                    Quarantine
                    <CountChip value={rows.length} />
                </h2>
            </div>
            {filtering ? (
                <Toolbar>
                    <Segmented
                        options={options}
                        value={kind}
                        onValueChange={(value) => setKind(value as Kind)}
                        aria-label="Value kind"
                    />
                </Toolbar>
            ) : null}
            {shown.length > 0 ? <QuarantineTable rows={shown} now={now} onMarkKnown={pick} /> : null}
            {rows.length === 0 ? (
                <TableState title="Nothing in quarantine" />
            ) : shown.length === 0 ? (
                <TableState
                    title={`No quarantined ${PLURALS[kind]}`}
                    action={
                        <Button variant="outline" size="sm" onClick={() => setKind("all")}>
                            Show all
                        </Button>
                    }
                />
            ) : null}
            <WatchingTable rows={watching} runsToBlock={check.runsToBlock} now={now} />
            <div role="status" aria-live="polite" className="sr-only">
                {announcement}
            </div>
            <MarkKnownDrawer
                open={open}
                value={picked}
                busy={busy}
                onConfirm={confirm}
                onClose={() => setOpen(false)}
            />
        </section>
    );
}
