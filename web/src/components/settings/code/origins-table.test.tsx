import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ORIGINS } from "../../../../test/settings/origins";
import { NOW } from "../../../../test/time";
import { OriginsTable } from "./origins-table";

describe("OriginsTable", () => {
    it("shows each override beside the default it replaces, the agents that set it and when", () => {
        render(<OriginsTable origins={ORIGINS} now={NOW} />);
        expect(
            screen.getByRole("table", {
                name: "Origin overrides the runs reported, with the default each one replaces",
            }),
        ).toBeTruthy();
        expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
            "Override",
            "Default",
            "Agents",
            "Last seen",
        ]);
        expect(screen.getAllByRole("row")).toHaveLength(ORIGINS.length + 1);
        const row = screen.getByText("mcp:crm.internal").closest("tr") as HTMLElement;
        const cells = within(row)
            .getAllByRole("cell")
            .map((cell) => cell.textContent);
        expect(cells).toEqual(["mcp:crm.internaltrusted", "untrusted · public", "billing, support", "12 min ago"]);
        expect(within(row).getByText("billing, support").getAttribute("title")).toBe("billing, support");
        expect(within(row).getByTitle("mcp:crm.internal · trusted · public")).toBeTruthy();
        expect(screen.queryByRole("status")).toBeNull();
    });

    it("keeps its header with a quiet line under it when no run reported an override", () => {
        render(<OriginsTable origins={[]} now={NOW} />);
        const table = screen.getByRole("table");
        expect(
            within(table)
                .getAllByRole("columnheader")
                .map((cell) => cell.textContent),
        ).toEqual(["Override", "Default", "Agents", "Last seen"]);
        expect(within(table).getAllByRole("row")).toHaveLength(1);
        expect(screen.getByRole("status").textContent).toBe("No origin overrides yet");
    });
});
