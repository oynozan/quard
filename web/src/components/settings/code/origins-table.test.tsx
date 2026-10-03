import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { getSettings } from "@/lib/data/settings";
import { OriginsTable } from "./origins-table";

const { origins } = await getSettings();

describe("OriginsTable", () => {
    it("says so when no origin was overridden", () => {
        render(<OriginsTable origins={[]} />);
        expect(screen.getByRole("status").textContent).toBe("No overrides");
        expect(screen.queryByRole("table")).toBeNull();
    });

    it("shows each override beside the default it replaces, why, the app and where it was set", () => {
        render(<OriginsTable origins={origins} />);
        expect(
            screen.getByRole("table", { name: "Origin overrides set in code, with the default each one replaces" }),
        ).toBeTruthy();
        expect(screen.getAllByRole("row")).toHaveLength(origins.length + 1);
        const row = screen.getByText("mcp:crm.acme.internal").closest("tr") as HTMLElement;
        const cells = within(row)
            .getAllByRole("cell")
            .map((cell) => cell.textContent);
        expect(cells).toEqual([
            "mcp:crm.acme.internaltrusted",
            "untrusted · public",
            "Our own MCP server holds CRM data",
            "support-app",
            "src/quard.ts:14",
        ]);
        expect(within(row).getByText("src/quard.ts:14").getAttribute("title")).toBe("src/quard.ts:14");
        expect(within(row).getByText("Our own MCP server holds CRM data").getAttribute("title")).toBe(
            "Our own MCP server holds CRM data",
        );
    });
});
