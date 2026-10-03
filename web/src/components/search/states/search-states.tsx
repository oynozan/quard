import { EmptyLine } from "@/components/kit/empty";

export type SearchStop = "card" | "hash-off" | "nothing" | "no-match";

// Text that holds nothing searchable reads the same as a search that found nothing
const STOP_LINE: Record<Exclude<SearchStop, "hash-off">, string> = {
    card: "Card numbers can't be searched",
    nothing: "No matches",
    "no-match": "No matches",
};

// Why a search lists nothing, in place of the results
export function SearchStopped({ reason }: { reason: SearchStop }) {
    if (reason !== "hash-off") return <EmptyLine>{STOP_LINE[reason]}</EmptyLine>;
    return (
        <EmptyLine>
            IBAN and email search needs <span className="mono">QUARD_HASH_KEY</span>
        </EmptyLine>
    );
}
