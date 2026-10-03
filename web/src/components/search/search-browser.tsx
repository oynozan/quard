"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/ui/search-field";
import { searchHref } from "./lib/group";

type SearchBrowserProps = {
    query: string;
    children: ReactNode;
};

// The big search field and its results, with the query in the URL to share or reload
export function SearchBrowser({ query, children }: SearchBrowserProps) {
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
                className="flex gap-2 max-[760px]:flex-col"
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
                {/* A tonal button, so the field leads */}
                <Button type="submit" variant="outline" size="tall" busy={pending} className="min-w-[96px]">
                    {pending ? "Searching…" : "Search"}
                </Button>
            </form>

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
