"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { RefreshButton, Toolbar, ToolbarSpacer } from "@/components/kit/table/toolbar";
import { SearchField } from "@/components/ui/search-field";
import { Select, type SelectOption } from "@/components/ui/select";
import { RUN_STATUSES, STATUS_WORD, runsHref, type RunsFilter } from "./lib/params";
import { OutcomeLegend } from "./outcome-legend";

const ALL = "all";
const SEARCH_DELAY = 250;

const STATUS_OPTIONS: SelectOption[] = [
    { value: ALL, label: "All statuses" },
    ...RUN_STATUSES.map((status) => ({ value: status, label: STATUS_WORD[status] })),
];

type RunsBrowserProps = {
    filter: RunsFilter;
    agents: string[];
    children: ReactNode;
};

// The toolbar and the table under it. Every filter lives in the URL, so links can be shared.
export function RunsBrowser({ filter, agents, children }: RunsBrowserProps) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [refreshing, startRefresh] = useTransition();
    const [query, setQuery] = useState(filter.q);
    const [seenQuery, setSeenQuery] = useState(filter.q);
    const [pushedQuery, setPushedQuery] = useState(filter.q);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Back, forward and "Clear filters" change the URL without typing, so follow them.
    if (filter.q !== seenQuery) {
        setSeenQuery(filter.q);
        if (filter.q !== pushedQuery) {
            setPushedQuery(filter.q);
            setQuery(filter.q);
        }
    }

    useEffect(() => () => clearTimer(timer), []);

    const go = (next: Partial<RunsFilter>) => {
        clearTimer(timer);
        const target = { ...filter, q: query.trim(), ...next };
        setPushedQuery(target.q);
        startTransition(() => router.replace(runsHref(target), { scroll: false }));
    };

    const onSearch = (value: string) => {
        setQuery(value);
        clearTimer(timer);
        timer.current = setTimeout(() => go({ q: value.trim() }), SEARCH_DELAY);
    };

    const agentOptions: SelectOption[] = [
        { value: ALL, label: "All agents" },
        ...agents.map((agent) => ({ value: agent, label: agent })),
        // A shared link can name an agent this workspace no longer has.
        ...(filter.agent && !agents.includes(filter.agent) ? [{ value: filter.agent, label: filter.agent }] : []),
    ];

    return (
        <div>
            <Toolbar>
                <SearchField
                    aria-label="Search runs"
                    placeholder="Search by run id, agent, tool or status"
                    value={query}
                    onChange={(event) => onSearch(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") go({ q: query.trim() });
                    }}
                />
                <Select
                    size="compact"
                    aria-label="Filter by agent"
                    options={agentOptions}
                    value={filter.agent || ALL}
                    onValueChange={(value) => go({ agent: value === ALL ? "" : value })}
                />
                <Select
                    size="compact"
                    aria-label="Filter by status"
                    options={STATUS_OPTIONS}
                    value={filter.status || ALL}
                    onValueChange={(value) => go({ status: value === ALL ? "" : (value as RunsFilter["status"]) })}
                />
                <ToolbarSpacer />
                <OutcomeLegend />
                <RefreshButton
                    busy={refreshing}
                    aria-label="Refresh runs"
                    onClick={() => startRefresh(() => router.refresh())}
                />
            </Toolbar>
            <div
                aria-busy={pending || undefined}
                className="transition-opacity duration-150 data-[pending=true]:opacity-55"
                data-pending={pending}
            >
                {children}
            </div>
        </div>
    );
}

function clearTimer(timer: { current: ReturnType<typeof setTimeout> | null }) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
}
