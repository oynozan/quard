import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { RetentionRow } from "@/lib/data/settings";
import { RETENTION } from "../../../../test/settings/data";
import { RetentionPanel } from "./retention-panel";

function keptFor(item: string): HTMLElement {
    const row = screen.getByText(item).closest("tr") as HTMLElement;
    return within(row).getAllByRole("cell")[1];
}

function detail(term: string): HTMLElement {
    return screen.getByText(term).nextElementSibling as HTMLElement;
}

describe("RetentionPanel", () => {
    it("lists what is kept and for how long, with the figure in mono", () => {
        render(<RetentionPanel retention={RETENTION} />);
        expect(screen.getByRole("table", { name: "What Quard keeps and for how long" })).toBeTruthy();
        const runs = keptFor("Runs");
        expect(runs.textContent).toBe("30 days");
        expect(runs.querySelector(".mono")?.textContent).toBe("30");
        expect(keptFor("Runs tied to an incident").textContent).toBe("1 year");
    });

    it("writes kept-for words as they are when there is no day count", () => {
        render(<RetentionPanel retention={RETENTION} />);
        expect(keptFor("Memory labels").textContent).toBe("Kept");
        expect(keptFor("Approval arguments").textContent).toBe("Until decided");
        expect(keptFor("Memory labels").querySelector(".mono")).toBeNull();
    });

    it("keeps a day count written in words out of the mono face", () => {
        const rows: RetentionRow[] = [{ item: "Exports", keep: "One week", days: 7 }];
        render(<RetentionPanel retention={rows} />);
        expect(keptFor("Exports").textContent).toBe("One week");
        expect(keptFor("Exports").querySelector(".mono")).toBeNull();
    });

    it("shows how sensitive values are stored, and nothing about hash key dates or a detector", () => {
        render(<RetentionPanel retention={RETENTION} />);
        expect(screen.getByRole("heading", { level: 2, name: "Redaction" })).toBeTruthy();
        expect(detail("Sensitive values").textContent).toBe("IBANs, cards, emails and secrets");
        expect(detail("Stored as").textContent).toBe("HMAC-SHA-256");
        expect(screen.getAllByRole("term").map((term) => term.textContent)).toEqual(["Sensitive values", "Stored as"]);
        expect(screen.queryByText("Hash key set")).toBeNull();
        expect(screen.queryByText("Previous key")).toBeNull();
        expect(screen.queryByRole("heading", { name: "Detector" })).toBeNull();
    });

    it("keeps the table header and the redaction facts before the install has a project", () => {
        render(<RetentionPanel retention={[]} />);
        const table = screen.getByRole("table", { name: "What Quard keeps and for how long" });
        const headers = within(table)
            .getAllByRole("columnheader")
            .map((cell) => cell.textContent);
        expect(headers).toEqual(["Data", "Kept for"]);
        expect(within(table).getAllByRole("row")).toHaveLength(1);
        expect(screen.getByRole("heading", { level: 3, name: "No project yet" })).toBeTruthy();
        expect(screen.getByText("Creating the first agent key sets up the project.")).toBeTruthy();
        expect(detail("Stored as").textContent).toBe("HMAC-SHA-256");
    });

    it("shows no empty state once the project has retention rows", () => {
        render(<RetentionPanel retention={RETENTION} />);
        expect(screen.queryByText("No project yet")).toBeNull();
    });
});
