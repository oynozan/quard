import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { matchOf, resultOf } from "../../../../test/incidents-search/search";
import { SearchSummary } from "./search-summary";

describe("SearchSummary", () => {
    it("counts one match in one run, names the kind and leaves out a query shown as typed", () => {
        const { container } = render(<SearchSummary result={resultOf()} />);
        expect(screen.getByRole("status").textContent).toBe("1 match in 1 run for supplier-portal.example");
        expect(container.firstElementChild?.textContent).toBe("1 match in 1 run for supplier-portal.exampleDomain");
        expect(screen.queryByTitle("supplier-portal.example")).toBeNull();
    });

    it("uses plural words for many matches and runs", () => {
        render(<SearchSummary result={resultOf({ total: 3, runs: 2 })} />);
        expect(screen.getByRole("status").textContent).toBe("3 matches in 2 runs for supplier-portal.example");
    });

    it("shows a masked query and says it matched by hash", () => {
        const result = resultOf({ query: "DE89370400440532013000", shown: "DE89…3000", kind: "iban", byHash: true });
        render(<SearchSummary result={result} />);
        const masked = screen.getByTitle("DE89…3000");
        expect(masked.textContent).toBe("DE89…3000");
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
