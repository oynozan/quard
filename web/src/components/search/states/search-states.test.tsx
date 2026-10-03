import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SearchIntro, SearchStopped } from "./search-states";

const HEADS = ["Step", "Agent", "Field", "Value", "Label", "Time"];

function heads() {
    return screen.getAllByRole("columnheader").map((head) => head.textContent);
}

describe("SearchIntro", () => {
    it("lists what each kind of query finds, as wide as the search row", () => {
        render(<SearchIntro />);
        const section = screen.getByRole("region", { name: "What you can search" });
        expect(section.className).toContain("max-w-[760px]");
        const terms = within(section)
            .getAllByRole("term")
            .map((term) => term.textContent);
        const finds = within(section)
            .getAllByRole("definition")
            .map((item) => item.textContent);
        expect(terms).toEqual(["Domain or URL", "IBAN or email", "File path or ID", "Agent or tool"]);
        expect(finds).toEqual([
            "Same host or main domain",
            "Exact match, by hash",
            "Any value that holds it",
            "Runs where it appears",
        ]);
    });
});

describe("SearchStopped", () => {
    it.each([
        ["no-match", "No matches"],
        ["card", "Card numbers can't be searched"],
        ["nothing", "No matches"],
    ] as const)("keeps the results header with %s under it and a way to clear", (reason, title) => {
        render(<SearchStopped reason={reason} />);
        expect(heads()).toEqual(HEADS);
        const state = screen.getByRole("status");
        expect(within(state).getByRole("heading", { level: 3 }).textContent).toBe(title);
        expect(within(state).getByRole("link", { name: "Clear search" }).getAttribute("href")).toBe("/search");
    });

    it("names the setting IBAN and email search needs, in mono", () => {
        render(<SearchStopped reason="hash-off" />);
        expect(heads()).toEqual(HEADS);
        const state = screen.getByRole("status");
        const title = within(state).getByRole("heading", { level: 3 });
        expect(title.textContent).toBe("IBAN and email search needs QUARD_HASH_KEY");
        expect(within(title).getByText("QUARD_HASH_KEY").className).toContain("mono");
        expect(within(state).getByRole("link", { name: "Clear search" }).getAttribute("href")).toBe("/search");
    });

    it("says there are no runs yet under the header, with nothing to clear", () => {
        render(<SearchStopped reason="no-runs" />);
        expect(heads()).toEqual(HEADS);
        const state = screen.getByRole("status");
        expect(state.textContent).toBe("No runs yet");
        expect(within(state).queryByRole("link")).toBeNull();
    });
});
