"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CountChip } from "@/components/kit/headings";
import { TableState } from "@/components/kit/data-table";
import { Toolbar } from "@/components/kit/table/toolbar";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { showToast } from "@/components/ui/toast";
import { markKnown } from "@/lib/data/fleet/actions";
import type { FleetCheckFacts, QuarantinedValue, WatchedValue } from "@/lib/data/fleet";
import { formatShortDate } from "@/lib/format";
import { MarkKnownDrawer } from "./mark-known-drawer";
import { QuarantineTable } from "./quarantine-table";
import { KIND_NAMES } from "./value-cell";
import { WatchingTable } from "./watching-table";

type Kind = "all" | QuarantinedValue["kind"];

const KINDS: Kind[] = ["all", "iban", "email", "domain"];
// The kind filter only helps once the list is long
const FILTER_FROM = 6;
const PLURALS = { all: "values", iban: "IBANs", email: "email addresses", domain: "domains", wallet: "wallets" };

type QuarantineSectionProps = {
    quarantine: QuarantinedValue[];
    watching: WatchedValue[];
    check: FleetCheckFacts;
    now: number;
};

// "iban, to and url"
function listOf(words: string[]): string {
    return words.length > 1 ? `${words.slice(0, -1).join(", ")} and ${words.at(-1)}` : words.join("");
}

// The fleet-check quarantine list. "Mark as known" lifts a value's block on every SDK.
export function QuarantineSection({ quarantine, watching, check, now }: QuarantineSectionProps) {
    const router = useRouter();
    // Values marked known here, hidden until the page's data catches up
    const [known, setKnown] = useState<string[]>([]);
    const [kind, setKind] = useState<Kind>("all");
    const [picked, setPicked] = useState<QuarantinedValue | null>(null);
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [announcement, setAnnouncement] = useState("");
    const headingRef = useRef<HTMLDivElement>(null);
    const timers = useRef<number[]>([]);

    useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), []);

    const rows = quarantine.filter((row) => !known.includes(row.key));
    const filtering = rows.length > FILTER_FROM;
    const shown = !filtering || kind === "all" ? rows : rows.filter((row) => row.kind === kind);
    const options = KINDS.map((value) => ({
        value,
        label: value === "all" ? "All" : KIND_NAMES[value],
        count: value === "all" ? rows.length : rows.filter((row) => row.kind === value).length,
    }));
    // The check only records "would block" for its first days in a project
    const observeUntil = check.observeUntil !== null && check.observeUntil > now ? check.observeUntil : null;

    function pick(row: QuarantinedValue) {
        setPicked(row);
        setOpen(true);
    }

    async function confirm() {
        if (!picked) return;
        const done = picked;
        setBusy(true);
        let found: boolean;
        try {
            found = await markKnown(done.key);
        } catch {
            setBusy(false);
            showToast(`Could not mark ${done.value} as known`, "mark-known");
            return;
        }
        const left = rows.filter((row) => row.key !== done.key).length;
        setKnown((list) => [...list, done.key]);
        setBusy(false);
        setOpen(false);
        if (found) {
            showToast(`${done.value} marked as known`, "mark-known");
            setAnnouncement(`${done.value} marked as known. ${left} left in quarantine.`);
        } else {
            showToast(`${done.value} is no longer in quarantine`, "mark-known");
            router.refresh();
        }
        timers.current.push(window.setTimeout(() => headingRef.current?.focus(), 260));
    }

    return (
        <section aria-label="Quarantine">
            <div
                ref={headingRef}
                tabIndex={-1}
                className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 outline-none"
            >
                <h2 className="text-[15px] leading-[1.4] font-extralight max-[760px]:text-[14px]">
                    Quarantine
                    <CountChip value={rows.length} />
                </h2>
                {observeUntil !== null ? (
                    <p className="text-[12px] font-light text-ink-muted">
                        Observe mode until <span className="mono text-ink-2">{formatShortDate(observeUntil)}</span>
                    </p>
                ) : null}
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
            <QuarantineTable rows={shown} now={now} onMarkKnown={pick} />
            {rows.length === 0 ? (
                <TableState
                    title="Nothing in quarantine"
                    body={check.fields.length > 0 ? `Watching the ${listOf(check.fields)} fields.` : undefined}
                />
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
