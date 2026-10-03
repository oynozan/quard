import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoChartsOrTables } from "../../../../test/empty";
import { SearchStopped } from "./search-states";

describe("SearchStopped", () => {
    it.each([
        ["no-match", "No matches"],
        ["card", "Card numbers can't be searched"],
        ["nothing", "No matches"],
    ] as const)("says %s in one line with no table", (reason, line) => {
        render(<SearchStopped reason={reason} />);
        expect(screen.getByRole("status").textContent).toBe(line);
        expectNoChartsOrTables();
    });

    it("names the setting IBAN and email search needs, in one line", () => {
        render(<SearchStopped reason="hash-off" />);
        const status = screen.getByRole("status");
        expect(status.textContent).toBe("IBAN and email search needs QUARD_HASH_KEY");
        expect(within(status).getByText("QUARD_HASH_KEY").className).toContain("mono");
        expectNoChartsOrTables();
    });
});
