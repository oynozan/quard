import type { Metadata } from "next";
import { RunsBrowser } from "@/components/runs/list/runs-browser";
import { RunsHeading } from "@/components/runs/list/runs-heading";
import { RunsEmpty, RunsNoMatch } from "@/components/runs/list/runs-states";
import { RunsTable } from "@/components/runs/list/runs-table";
import { isFiltered, parseRunsFilter } from "@/components/runs/list/lib/params";
import { listRuns, requestTime } from "@/lib/data/runs/query";
import { PAGE_LIST } from "@/components/kit/page";

export const metadata: Metadata = { title: "Runs" };

export default async function RunsPage({ searchParams }: PageProps<"/runs">) {
    const filter = parseRunsFilter(await searchParams);
    const [all, runs, now] = await Promise.all([
        listRuns(),
        listRuns({
            query: filter.q || undefined,
            agent: filter.agent || undefined,
            status: filter.status || undefined,
        }),
        requestTime(),
    ]);
    const agents = [...new Set(all.flatMap((run) => run.agents))].sort();
    const filtered = isFiltered(filter);

    return (
        <div className={PAGE_LIST}>
            <RunsHeading count={runs.length} filtered={filtered} />
            <RunsBrowser filter={filter} agents={agents}>
                <p role="status" className="sr-only">
                    {filtered ? `${runs.length} ${runs.length === 1 ? "run matches" : "runs match"}` : ""}
                </p>
                {runs.length > 0 ? <RunsTable runs={runs} now={now} /> : filtered ? <RunsNoMatch /> : <RunsEmpty />}
            </RunsBrowser>
        </div>
    );
}
