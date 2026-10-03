"use client";

import { useState } from "react";
import { EmptyLine } from "@/components/kit/empty";
import { SectionHeading } from "@/components/kit/headings";
import { Toolbar } from "@/components/kit/table/toolbar";
import { Segmented } from "@/components/ui/segmented";
import type { QuarantinedValue, WatchedValue } from "@/lib/data/fleet";
import { hasQuarantine } from "../lib/sections";
import { EmptySection } from "../section-states";
import { QuarantineTable } from "./quarantine-table";
import { KIND_NAMES } from "./value-cell";
import { WatchingTable } from "./watching-table";

type Kind = "all" | QuarantinedValue["kind"];

const KINDS: QuarantinedValue["kind"][] = ["iban", "email", "domain"];
// The kind filter only helps once the list is long
const FILTER_FROM = 6;
// PROJECT.md Q9 blocks a value everywhere once a 5th run uses it within 24 hours
const RUNS_TO_BLOCK = 5;

type QuarantineSectionProps = { quarantine: QuarantinedValue[]; watching: WatchedValue[]; now: number };

// Values the fleet check blocked everywhere, and new values it is still counting
export function QuarantineSection({ quarantine, watching, now }: QuarantineSectionProps) {
    const [kind, setKind] = useState<Kind>("all");
    if (!hasQuarantine({ quarantine, watching })) {
        return <EmptySection title="Quarantine">Nothing in quarantine</EmptySection>;
    }

    // Only kinds the list holds are offered, and a picked kind that runs out shows them all
    const offered = KINDS.map((value) => ({
        value,
        count: quarantine.filter((row) => row.kind === value).length,
    })).filter((item) => item.count > 0);
    const filtering = quarantine.length > FILTER_FROM;
    const picked = filtering && offered.some((item) => item.value === kind) ? kind : "all";
    const shown = picked === "all" ? quarantine : quarantine.filter((row) => row.kind === picked);
    const options = [
        { value: "all", label: "All", count: quarantine.length },
        ...offered.map(({ value, count }) => ({ value, label: KIND_NAMES[value], count })),
    ];

    return (
        <section aria-label="Quarantine">
            <SectionHeading title="Quarantine" count={quarantine.length > 0 ? quarantine.length : undefined} />
            {filtering ? (
                <Toolbar>
                    <Segmented
                        options={options}
                        value={picked}
                        onValueChange={(value) => setKind(value as Kind)}
                        aria-label="Value kind"
                    />
                </Toolbar>
            ) : null}
            {quarantine.length > 0 ? (
                <QuarantineTable rows={shown} now={now} />
            ) : (
                <EmptyLine>Nothing in quarantine</EmptyLine>
            )}
            <WatchingTable rows={watching} runsToBlock={RUNS_TO_BLOCK} now={now} />
        </section>
    );
}
