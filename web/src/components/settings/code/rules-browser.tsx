"use client";

import { useMemo, useState } from "react";
import { TableState } from "@/components/kit/data-table";
import { SectionHeading } from "@/components/kit/headings";
import { Toolbar } from "@/components/kit/table/toolbar";
import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/ui/search-field";
import { Select } from "@/components/ui/select";
import type { RuleRow } from "@/lib/data/settings";
import { LiveNote } from "../shared/panel-intro";
import { guardWord, RulesTable } from "./rules-table";

const GUARDS: RuleRow["guard"][] = ["source", "action", "approval", "egress", "limit"];

const GUARD_OPTIONS = [
    { value: "all", label: "All guards" },
    ...GUARDS.map((guard) => ({ value: guard, label: guardWord(guard) })),
];

const MODE_OPTIONS = [
    { value: "all", label: "All modes" },
    { value: "block", label: "Block" },
    { value: "observe", label: "Observe" },
    { value: "ask", label: "Always asks" },
];

function matches(rule: RuleRow, query: string, guard: string, mode: string): boolean {
    if (guard !== "all" && rule.guard !== guard) return false;
    if (mode !== "all" && (rule.mode ?? "ask") !== mode) return false;
    if (!query) return true;
    const text = [rule.name, rule.summary, rule.hash, ...rule.tools, ...rule.apps].join(" ").toLowerCase();
    return text.includes(query);
}

// The rules table with search and two filters, read-only
export function RulesBrowser({ rules }: { rules: RuleRow[] }) {
    const [query, setQuery] = useState("");
    const [guard, setGuard] = useState("all");
    const [mode, setMode] = useState("all");
    const needle = query.trim().toLowerCase();
    const shown = useMemo(
        () => rules.filter((rule) => matches(rule, needle, guard, mode)),
        [rules, needle, guard, mode],
    );
    const filtered = needle !== "" || guard !== "all" || mode !== "all";

    function clear() {
        setQuery("");
        setGuard("all");
        setMode("all");
    }

    return (
        <section aria-label="Rules">
            <SectionHeading title="Rules" count={filtered ? shown.length : rules.length} />
            {rules.length > 0 ? (
                <Toolbar>
                    <SearchField
                        placeholder="Search rules, tools or hashes"
                        aria-label="Search rules"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                    />
                    <Select
                        size="compact"
                        aria-label="Guard type"
                        options={GUARD_OPTIONS}
                        value={guard}
                        onValueChange={setGuard}
                    />
                    <Select
                        size="compact"
                        aria-label="Mode"
                        options={MODE_OPTIONS}
                        value={mode}
                        onValueChange={setMode}
                    />
                </Toolbar>
            ) : null}
            <RulesTable rules={shown} />
            {rules.length === 0 ? (
                <TableState title="No rules reported yet" />
            ) : shown.length === 0 ? (
                <TableState
                    title="No rules match"
                    action={
                        <Button size="sm" onClick={clear}>
                            Clear filters
                        </Button>
                    }
                />
            ) : null}
            <LiveNote message={filtered ? `${shown.length} of ${rules.length} rules shown` : ""} />
        </section>
    );
}
