import Link from "next/link";
import { DataTable, TableState } from "@/components/kit/data-table";
import { DetailList, DetailRow } from "@/components/kit/detail/detail-list";
import { buttonVariants } from "@/components/ui/button";
import { SEARCH_MIN_WIDTH, SearchColgroup, SearchHead } from "../results/search-columns";

// What each kind of query finds, shown before the first search.
const KINDS: { term: string; finds: string }[] = [
    { term: "Domain or URL", finds: "Same host or main domain" },
    { term: "IBAN, card or email", finds: "Exact match, by hash" },
    { term: "File path or ID", finds: "Any value that holds it" },
    { term: "Agent or tool", finds: "Runs where it appears" },
    { term: "Other text", finds: "3+ characters" },
];

export function SearchIntro() {
    return (
        <section aria-labelledby="search-kinds" className="max-w-[760px]">
            <h2 id="search-kinds" className="mb-4 text-[15px] leading-[1.4] font-extralight max-[760px]:text-[14px]">
                What you can search
            </h2>
            <DetailList>
                {KINDS.map((kind) => (
                    <DetailRow key={kind.term} term={kind.term}>
                        <span className="text-ink-2">{kind.finds}</span>
                    </DetailRow>
                ))}
            </DetailList>
        </section>
    );
}

// The header row with a centered state block under it, as full tables show empties.
function StateFrame({ children }: { children: React.ReactNode }) {
    return (
        <div>
            <DataTable minWidth={SEARCH_MIN_WIDTH} className="text-[14px]">
                <SearchColgroup />
                <SearchHead />
            </DataTable>
            <div role="status" className="min-h-[320px] border-b border-line [&>div]:min-h-[320px]">
                {children}
            </div>
        </div>
    );
}

const CLEAR = (
    <Link href="/search" scroll={false} className={buttonVariants({ variant: "outline", size: "sm" })}>
        Clear search
    </Link>
);

export function SearchNoMatch({ byHash }: { byHash: boolean }) {
    const body = byHash ? "Sensitive values match only in full." : "Try a shorter value or the main domain.";
    return (
        <StateFrame>
            <TableState title="No matches" body={body} action={CLEAR} />
        </StateFrame>
    );
}

export function SearchTooShort() {
    return (
        <StateFrame>
            <TableState title="Type a little more" body="Text needs 3 or more characters." action={CLEAR} />
        </StateFrame>
    );
}
