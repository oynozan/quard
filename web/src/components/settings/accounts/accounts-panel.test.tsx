import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoChartsOrTables } from "../../../../test/empty";
import { AccountsPanel } from "./accounts-panel";

describe("AccountsPanel", () => {
    it("says sign-in is open, with no table and nothing to invite", () => {
        render(<AccountsPanel />);
        const panel = screen.getByRole("region", { name: "Accounts" });
        expect(panel.textContent).toBe("Anyone who signs in with email or GitHub can use Quard");
        expect(screen.queryByRole("button")).toBeNull();
        expectNoChartsOrTables(panel);
    });
});
