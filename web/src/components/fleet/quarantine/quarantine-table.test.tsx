import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { formatLongDate, formatShortDate } from "@/lib/format";
import { QUARANTINE } from "../../../../test/summary/fleet";
import { NOW } from "../../../../test/time";
import { QuarantineTable } from "./quarantine-table";

describe("QuarantineTable", () => {
    it("lists each quarantined value with its agents, dates and blocked attempts", () => {
        render(<QuarantineTable rows={QUARANTINE} now={NOW} />);
        const bodyRows = screen.getAllByRole("row").slice(1);
        const email = QUARANTINE[2];
        const cells = within(bodyRows[2]).getAllByRole("cell");

        expect(bodyRows).toHaveLength(QUARANTINE.length);
        expect(cells[0].textContent).toContain(email.value);
        expect(cells[1].textContent).toBe("billing, support");
        expect(cells[1].getAttribute("title")).toBe("billing, support");
        expect(cells[2].textContent).toBe(formatShortDate(email.quarantinedAt));
        expect(cells[2].getAttribute("title")).toBe(formatLongDate(email.quarantinedAt));
        expect(cells[3].textContent).toBe("2");
        expect(cells[4].textContent).toBe("12 d ago");
        expect(cells[4].getAttribute("title")).toBe(formatLongDate(email.lastAttemptAt));
    });

    it("is read-only, with no row actions", () => {
        render(<QuarantineTable rows={QUARANTINE} now={NOW} />);

        expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
            "Value",
            "Agents",
            "Quarantined",
            "Blocked",
            "Last attempt",
        ]);
        expect(screen.queryByRole("button")).toBeNull();
    });
});
