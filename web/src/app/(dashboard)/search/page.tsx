import type { Metadata } from "next";
import { EmptyLine } from "@/components/kit/empty";
import { PageHeading } from "@/components/kit/headings";
import { PAGE_LIST } from "@/components/kit/page";
import { groupByRun, readQuery } from "@/components/search/lib/group";
import { SearchList } from "@/components/search/results/search-list";
import { SearchResults } from "@/components/search/results/search-results";
import { SearchSummary } from "@/components/search/results/search-summary";
import { SearchBrowser } from "@/components/search/search-browser";
import { SearchIntro, SearchStopped } from "@/components/search/states/search-states";
import { searchRuns, type SearchState } from "@/lib/data/search";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
    const query = readQuery(await searchParams);
    const search = await searchRuns(query);

    return (
        <div className={PAGE_LIST}>
            <PageHeading title="Search" />
            {search.state === "no-runs" ? (
                <EmptyLine>No runs yet</EmptyLine>
            ) : (
                <SearchBrowser query={query}>
                    <SearchOutcome search={search} />
                </SearchBrowser>
            )}
        </div>
    );
}

function SearchOutcome({ search }: { search: Exclude<SearchState, { state: "no-runs" }> }) {
    if (search.state === "idle") return <SearchIntro />;
    if (search.state !== "searched") return <SearchStopped reason={search.state} />;

    const { result } = search;
    const groups = groupByRun(result.matches, result.runRows);
    if (groups.length === 0) return <SearchStopped reason="no-match" />;
    return (
        <>
            <SearchSummary result={result} />
            <div className="max-[760px]:hidden">
                <SearchResults groups={groups} />
            </div>
            <div className="hidden max-[760px]:block">
                <SearchList groups={groups} />
            </div>
        </>
    );
}
