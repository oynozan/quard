import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { quarantined } from "@/lib/data/fleet/quarantine";
import { NOW } from "@/lib/data/rng";
import { formatLongDate, formatShortDate } from "@/lib/format";
import { QuarantineTable } from "./quarantine-table";

const rows = quarantined();

describe("QuarantineTable", () => {
    it("lists each quarantined value with its agents, dates and blocked attempts", () => {
        render(<QuarantineTable rows={rows} now={NOW} onMarkKnown={() => {}} />);
        const bodyRows = screen.getAllByRole("row").slice(1);
        expect(bodyRows).toHaveLength(rows.length);

        const email = rows[2];
        const cells = within(bodyRows[2]).getAllByRole("cell");
        expect(cells[0].textContent).toContain(email.value);
        expect(cells[1].textContent).toBe("billing, support");
        expect(cells[1].getAttribute("title")).toBe("billing, support");
        expect(cells[2].textContent).toBe(formatShortDate(email.quarantinedAt));
        expect(cells[2].getAttribute("title")).toBe(formatLongDate(email.quarantinedAt));
        expect(cells[3].textContent).toBe("2");
        expect(cells[4].textContent).toBe("12 d ago");
        expect(cells[4].getAttribute("title")).toBe(formatLongDate(email.lastAttemptAt));
    });

    it("hands the row to the caller when its Mark as known button is pressed", () => {
        const onMarkKnown = vi.fn();
        render(<QuarantineTable rows={rows} now={NOW} onMarkKnown={onMarkKnown} />);
        fireEvent.click(screen.getByRole("button", { name: `Mark ${rows[1].value} as known` }));
        expect(onMarkKnown).toHaveBeenCalledWith(rows[1]);
    });
});
