import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { stat } from "../../../test/labels/chunks";
import { LabelStats } from "./label-stats";

describe("LabelStats", () => {
    it("shows reviewed examples per label, and how often a flag was right only for risky labels", () => {
        render(
            <LabelStats
                rows={[
                    stat("payment_fraud", true, { open: 1, reviewed: 4, right: 3, flagged: 2, flaggedRight: 1 }),
                    stat("phishing", true),
                    stat("invoice", false, { reviewed: 2, right: 2 }),
                ]}
            />,
        );
        const rows = within(screen.getByRole("table"))
            .getAllByRole("row")
            .map((row) => [...row.querySelectorAll("td,th")].map((cell) => cell.textContent));
        expect(rows).toEqual([
            ["Label", "To review", "Reviewed", "Right", "Right when flagged"],
            ["payment_fraud", "1", "4", "75%", "50%"],
            ["phishing", "0", "0", "—", "—"],
            ["invoice", "0", "2", "100%", ""],
        ]);
    });
});
