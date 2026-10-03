"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/ui/search-field";
import type { SearchKind } from "@/lib/data/search";
import { searchHref } from "./lib/group";

type SearchBrowserProps = {
    query: string;
    examples: { query: string; kind: SearchKind }[];
    children: ReactNode;
};

// The big search field, the example queries and the results under them.
// The query lives in the URL, so a search can be shared or reloaded.
export function SearchBrowser({ query, examples, children }: SearchBrowserProps) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [value, setValue] = useState(query);
    const [seen, setSeen] = useState(query);

    // Back, forward and links change the URL without typing, so follow them.
    if (query !== seen) {
        setSeen(query);
        setValue(query);
    }

    const go = (next: string) => {
        setValue(next);
        startTransition(() => router.push(searchHref(next), { scroll: false }));
    };

    return (
        <div>
            <form
                role="search"
                aria-label="Search all runs"
                className="flex max-w-[860px] gap-2 max-[760px]:flex-col"
                onSubmit={(event) => {
                    event.preventDefault();
                    go(value);
                }}
            >
                <SearchField
                    name="q"
                    aria-label="Search all runs"
                    placeholder="Domain, URL, IBAN, email, file path, ID, agent or tool"
                    autoComplete="off"
                    spellCheck={false}
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Escape" && value) {
                            event.preventDefault();
                            setValue("");
                        }
                    }}
                    boxClassName="h-[46px] max-w-none gap-[10px] px-[13px] max-[760px]:h-[46px] max-[760px]:flex-none"
                    className="mono text-[15px] placeholder:font-sans placeholder:text-[14px]"
                />
                <Button type="submit" variant="default" size="tall" busy={pending} className="min-w-[112px]">
                    {pending ? "Searching…" : "Search"}
                </Button>
            </form>

            <div className="mt-[14px] flex flex-wrap items-center gap-[6px] text-[13px]">
                <span className="mr-1 text-ink-muted">Try</span>
                {examples.map((example) => (
                    <button
                        key={example.query}
                        type="button"
                        onClick={() => go(example.query)}
                        title={example.query}
                        aria-current={example.query === query ? "true" : undefined}
                        className="mono max-w-full cursor-pointer truncate rounded-sm bg-tile px-2 py-[3px] text-[12px] text-ink-2 transition-colors hover:bg-highlight hover:text-ink-bright focus-visible:outline-2 focus-visible:outline-signal aria-[current=true]:bg-selected aria-[current=true]:text-ink-bright"
                    >
                        {example.query}
                    </button>
                ))}
            </div>

            <div
                aria-busy={pending || undefined}
                data-pending={pending}
                className="mt-[30px] transition-opacity duration-150 data-[pending=true]:opacity-55 max-[760px]:mt-[25px]"
            >
                {children}
            </div>
        </div>
    );
}
