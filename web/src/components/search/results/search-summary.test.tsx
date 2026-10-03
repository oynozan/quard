import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { matchOf, resultOf } from "../../../../test/incidents-search/search";
import { IBAN, IBAN_MASK } from "../../../../test/search/events";
import { SearchSummary } from "./search-summary";

describe("SearchSummary", () => {
    it("counts one match in one run, names the kind and leaves out a query shown as typed", () => {
        const { container } = render(<SearchSummary result={resultOf()} />);
        expect(screen.getByRole("status").textContent).toBe("1 match in 1 run for example.com");
        expect(container.firstElementChild?.textContent).toBe("1 match in 1 run for example.comDomain");
        expect(screen.queryByTitle("example.com")).toBeNull();
    });

    it("uses plural words for many matches and runs", () => {
        render(<SearchSummary result={resultOf({ total: 3, runs: 2 })} />);
        expect(screen.getByRole("status").textContent).toBe("3 matches in 2 runs for example.com");
    });

    it("shows a masked query and says it matched by hash", () => {
        const result = resultOf({ query: IBAN, shown: IBAN_MASK, kind: "iban", byHash: true });
        render(<SearchSummary result={result} />);
        const masked = screen.getByTitle(IBAN_MASK);
        expect(masked.textContent).toBe(IBAN_MASK);
        expect(screen.getByText("IBAN")).toBeTruthy();
        expect(screen.getByText("by hash")).toBeTruthy();
        expect(screen.queryByText(/newest/)).toBeNull();
    });

    it("says only the newest matches are listed when cut short", () => {
        const matches = [matchOf({ stepId: "s1" }), matchOf({ stepId: "s2" })];
        render(<SearchSummary result={resultOf({ matches, total: 250, runs: 9, truncated: true })} />);
        expect(screen.getByText(/newest/).textContent).toBe("newest 2");
        expect(screen.queryByText("by hash")).toBeNull();
    });
});
