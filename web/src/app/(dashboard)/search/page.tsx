import type { Metadata } from "next";
import { PageHeading } from "@/components/kit/headings";
import { groupByRun, readQuery } from "@/components/search/lib/group";
import { SearchList } from "@/components/search/results/search-list";
import { SearchResults } from "@/components/search/results/search-results";
import { SearchSummary } from "@/components/search/results/search-summary";
import { SearchBrowser } from "@/components/search/search-browser";
import { SearchIntro, SearchNoMatch, SearchTooShort } from "@/components/search/states/search-states";
import { listRuns } from "@/lib/data/runs/query";
import { SEARCH_EXAMPLES, searchRuns } from "@/lib/data/search";
import { PAGE_LIST } from "@/components/kit/page";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
    const query = readQuery(await searchParams);

    return (
        <div className={PAGE_LIST}>
            <PageHeading title="Search" />
            <SearchBrowser query={query} examples={SEARCH_EXAMPLES}>
                {query ? <SearchOutcome query={query} /> : <SearchIntro />}
            </SearchBrowser>
        </div>
    );
}

async function SearchOutcome({ query }: { query: string }) {
    const [result, runs] = await Promise.all([searchRuns(query), listRuns()]);

    if (result.total === 0) {
        if (result.kind === "text" && result.query.length < 3) return <SearchTooShort />;
        return <SearchNoMatch byHash={result.byHash} />;
    }

    const groups = groupByRun(result.matches, runs);
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
