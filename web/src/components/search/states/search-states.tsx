import { DetailList, DetailRow } from "@/components/kit/detail/detail-list";
import { EmptyLine } from "@/components/kit/empty";

// What each kind of query finds, shown before the first search
const KINDS: { term: string; finds: string }[] = [
    { term: "IBAN or email", finds: "Exact match, by hash" },
    { term: "URL or domain", finds: "Same host or main domain" },
    { term: "File path or ID", finds: "Any value that holds it" },
    { term: "Agent or tool name", finds: "Runs where it appears" },
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

export type SearchStop = "card" | "hash-off" | "nothing" | "no-match";

const STOP_LINE: Record<Exclude<SearchStop, "hash-off">, string> = {
    card: "Card numbers can't be searched",
    nothing: "Not an IBAN, email, URL, domain, path, ID, agent or tool",
    "no-match": "No matches",
};

// Why a search lists nothing, in place of the results
export function SearchStopped({ reason }: { reason: SearchStop }) {
    if (reason !== "hash-off") return <EmptyLine>{STOP_LINE[reason]}</EmptyLine>;
    return (
        <EmptyLine>
            IBAN and email search is off
            <span className="block">
                Set <span className="mono">QUARD_HASH_KEY</span> to the key your agents use
            </span>
        </EmptyLine>
    );
}
