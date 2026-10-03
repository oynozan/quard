import type { RunStatus } from "@/lib/data/types";

export const RUN_STATUSES: RunStatus[] = ["running", "waiting", "completed", "failed", "blocked"];

export const STATUS_WORD: Record<RunStatus, string> = {
    running: "Running",
    waiting: "Waiting",
    completed: "Completed",
    failed: "Failed",
    blocked: "Blocked",
};

// The filters a shared /runs link carries.
export type RunsFilter = { q: string; agent: string; status: RunStatus | "" };

type RawParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
    return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function isStatus(value: string): value is RunStatus {
    return (RUN_STATUSES as string[]).includes(value);
}

// Reads ?q=&agent=&status= and drops an unknown status.
export function parseRunsFilter(params: RawParams): RunsFilter {
    const status = first(params.status);
    return {
        q: first(params.q).slice(0, 200),
        agent: first(params.agent),
        status: isStatus(status) ? status : "",
    };
}

// The /runs link for a filter, leaving empty parts out.
export function runsHref(filter: RunsFilter): string {
    const search = new URLSearchParams();
    if (filter.q) search.set("q", filter.q);
    if (filter.agent) search.set("agent", filter.agent);
    if (filter.status) search.set("status", filter.status);
    const text = search.toString();
    return text ? `/runs?${text}` : "/runs";
}

export function isFiltered(filter: RunsFilter): boolean {
    return Boolean(filter.q || filter.agent || filter.status);
}
