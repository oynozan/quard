import Link from "next/link";
import type { ReactNode } from "react";
import { DataTable, TableState } from "@/components/kit/data-table";
import { DetailList, DetailRow } from "@/components/kit/detail/detail-list";
import { buttonVariants } from "@/components/ui/button";
import { SEARCH_MIN_WIDTH, SearchColgroup, SearchHead } from "../results/search-columns";

// What each kind of query finds, shown before the first search
const KINDS: { term: string; finds: string }[] = [
    { term: "Domain or URL", finds: "Same host or main domain" },
    { term: "IBAN or email", finds: "Exact match, by hash" },
    { term: "File path or ID", finds: "Any value that holds it" },
    { term: "Agent or tool", finds: "Runs where it appears" },
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

export type SearchStop = "no-runs" | "card" | "hash-off" | "nothing" | "no-match";

// The results header with a centered state block under it, as full tables show empties
function StateFrame({ children }: { children: ReactNode }) {
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

// Text that holds nothing searchable reads the same as a search that found nothing
const STOP_TITLE: Record<Exclude<SearchStop, "hash-off">, string> = {
    "no-runs": "No runs yet",
    card: "Card numbers can't be searched",
    nothing: "No matches",
    "no-match": "No matches",
};

// Laid out like TableState, whose title takes plain text, so the key's name can be mono
function HashKeyOff() {
    return (
        <div className="flex min-h-[190px] flex-col items-center justify-center gap-3 px-[18px] py-[25px] text-center">
            <h3 className="text-[14px] font-[450] text-ink">
                IBAN and email search needs <span className="mono">QUARD_HASH_KEY</span>
            </h3>
            {CLEAR}
        </div>
    );
}

// Why a search lists nothing, under the results header
export function SearchStopped({ reason }: { reason: SearchStop }) {
    return (
        <StateFrame>
            {reason === "hash-off" ? (
                <HashKeyOff />
            ) : (
                <TableState title={STOP_TITLE[reason]} action={reason === "no-runs" ? undefined : CLEAR} />
            )}
        </StateFrame>
    );
}
