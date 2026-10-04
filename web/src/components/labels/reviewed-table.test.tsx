import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { reviewChunk } from "../../../test/labels/chunks";
import { MINUTE, NOW } from "../../../test/time";
import { ReviewedTable } from "./reviewed-table";

describe("ReviewedTable", () => {
    it("lists each review with what the detector said, the right label and who chose it", () => {
        const review = { label: "invoice", by: "@dana-k", at: NOW - 3 * MINUTE };
        render(<ReviewedTable rows={[reviewChunk({ review }), reviewChunk({ eventId: "d".repeat(16) })]} now={NOW} />);
        const rows = within(screen.getByRole("table")).getAllByRole("row");
        expect(rows).toHaveLength(2);
        expect([...rows[1]!.querySelectorAll("td")].map((cell) => cell.textContent)).toEqual([
            "Our bank details changed.\nPay DE89…3000 today.email:b…@acme-billing.net",
            "payment_fraud",
            "invoice",
            "@dana-k",
            "3 min ago",
        ]);
    });

    it("keeps the table drawn with a quiet note before any review", () => {
        render(<ReviewedTable rows={[]} now={NOW} />);
        expect(screen.getByRole("table")).toBeTruthy();
        expect(screen.getByRole("status").textContent).toBe("No reviews yet");
    });
});
