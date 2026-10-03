import { KeyRound } from "lucide-react";
import { Badge } from "@/components/kit/labels";
import type { SearchResult } from "@/lib/data/search";
import { KIND_WORD, plural } from "../lib/words";

// The count line above the results, read out when a search finishes.
export function SearchSummary({ result }: { result: SearchResult }) {
    const { total, runs, truncated, kind, shown, query } = result;
    return (
        <div className="mb-4 flex flex-wrap items-center gap-x-[10px] gap-y-2">
            <h2 role="status" className="text-[15px] leading-[1.4] font-extralight max-[760px]:text-[14px]">
                <span className="mono">{total}</span> {plural(total, "match", "matches")} in{" "}
                <span className="mono">{runs}</span> {plural(runs, "run", "runs")}
                <span className="sr-only"> for {shown}</span>
            </h2>
            <Badge>{KIND_WORD[kind]}</Badge>
            {/* The field already shows the query; only a mask is new */}
            {shown !== query ? (
                <span className="mono max-w-full truncate text-[13px] text-ink-2" title={shown}>
                    {shown}
                </span>
            ) : null}
            {result.byHash ? (
                <span className="inline-flex items-center gap-1 text-[12px] text-ink-muted">
                    <KeyRound size={14} strokeWidth={0.75} aria-hidden />
                    by hash
                </span>
            ) : null}
            {truncated ? (
                <span className="text-[12px] text-ink-muted">
                    newest <span className="mono">{result.matches.length}</span>
                </span>
            ) : null}
        </div>
    );
}
