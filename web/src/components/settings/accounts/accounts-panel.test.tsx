import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AccountsPanel } from "./accounts-panel";

describe("AccountsPanel", () => {
    it("keeps the table header and says under it that sign-in is open, with no rows and nothing to invite", () => {
        render(<AccountsPanel />);
        const panel = screen.getByRole("region", { name: "Accounts" });
        const table = within(panel).getByRole("table", { name: "Accounts" });
        const headers = within(table)
            .getAllByRole("columnheader")
            .map((cell) => cell.textContent);
        expect(headers).toEqual(["Person", "Added", "Last sign-in"]);
        expect(within(table).getAllByRole("row")).toHaveLength(1);
        expect(within(panel).getByRole("heading", { level: 3, name: "No accounts to manage" })).toBeTruthy();
        expect(within(panel).getByText("Anyone who signs in with email or GitHub can use Quard.")).toBeTruthy();
        expect(within(panel).queryByRole("button")).toBeNull();
    });
});
