import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoChartsOrTables } from "../../../../test/empty";
import { SearchIntro, SearchStopped } from "./search-states";

describe("SearchIntro", () => {
    it("lists what each kind of query finds, as terms rather than a table", () => {
        render(<SearchIntro />);
        const section = screen.getByRole("region", { name: "What you can search" });
        const terms = within(section)
            .getAllByRole("term")
            .map((term) => term.textContent);
        const finds = within(section)
            .getAllByRole("definition")
            .map((item) => item.textContent);
        expect(terms).toEqual(["IBAN or email", "URL or domain", "File path or ID", "Agent or tool name"]);
        expect(finds).toEqual([
            "Exact match, by hash",
            "Same host or main domain",
            "Any value that holds it",
            "Runs where it appears",
        ]);
        expectNoChartsOrTables();
    });
});

describe("SearchStopped", () => {
    it.each([
        ["no-match", "No matches"],
        ["card", "Card numbers can't be searched"],
        ["nothing", "Not an IBAN, email, URL, domain, path, ID, agent or tool"],
    ] as const)("says %s in one line with no table", (reason, line) => {
        render(<SearchStopped reason={reason} />);
        expect(screen.getByRole("status").textContent).toBe(line);
        expectNoChartsOrTables();
    });

    it("says IBAN and email search is off and names the setting that turns it on", () => {
        render(<SearchStopped reason="hash-off" />);
        const status = screen.getByRole("status");
        expect(status.textContent).toBe("IBAN and email search is offSet QUARD_HASH_KEY to the key your agents use");
        expect(within(status).getByText("QUARD_HASH_KEY").className).toContain("mono");
        expectNoChartsOrTables();
    });
});
