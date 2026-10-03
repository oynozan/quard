import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SearchIntro, SearchNoMatch, SearchTooShort } from "./search-states";

describe("SearchIntro", () => {
    it("lists what each kind of query finds", () => {
        render(<SearchIntro />);
        const section = screen.getByRole("region", { name: "What you can search" });
        const terms = within(section)
            .getAllByRole("term")
            .map((term) => term.textContent);
        const finds = within(section)
            .getAllByRole("definition")
            .map((item) => item.textContent);
        expect(terms).toEqual([
            "Domain or URL",
            "IBAN, card or email",
            "File path or ID",
            "Agent or tool",
            "Other text",
        ]);
        expect(finds).toEqual([
            "Same host or main domain",
            "Exact match, by hash",
            "Any value that holds it",
            "Runs where it appears",
            "3+ characters",
        ]);
    });
});

describe("SearchNoMatch", () => {
    it("suggests a shorter value for plain text", () => {
        render(<SearchNoMatch byHash={false} />);
        const state = screen.getByRole("status");
        expect(within(state).getByRole("heading", { name: "No matches" })).toBeTruthy();
        expect(within(state).getByText("Try a shorter value or the main domain.")).toBeTruthy();
        expect(within(state).getByRole("link", { name: "Clear search" }).getAttribute("href")).toBe("/search");
        expect(screen.getAllByRole("columnheader")).toHaveLength(6);
    });

    it("explains that sensitive values match only in full", () => {
        render(<SearchNoMatch byHash />);
        expect(screen.getByText("Sensitive values match only in full.")).toBeTruthy();
    });
});

describe("SearchTooShort", () => {
    it("asks for at least 3 characters and offers to clear", () => {
        render(<SearchTooShort />);
        const state = screen.getByRole("status");
        expect(within(state).getByRole("heading", { name: "Type a little more" })).toBeTruthy();
        expect(within(state).getByText("Text needs 3 or more characters.")).toBeTruthy();
        expect(within(state).getByRole("link", { name: "Clear search" }).getAttribute("href")).toBe("/search");
    });
});
