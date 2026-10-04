import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { reviewChunk, taxNotice } from "../../../test/labels/chunks";
import { NOW } from "../../../test/time";
import { QueueTable } from "./queue-table";

describe("QueueTable", () => {
    it("shows each chunk with its label, how sure the detector was and the fallback's label", () => {
        const onReview = vi.fn();
        render(<QueueTable rows={[reviewChunk(), taxNotice()]} now={NOW} onReview={onReview} />);
        const rows = within(screen.getByRole("table")).getAllByRole("row");
        expect([...rows[1]!.querySelectorAll("td")].map((cell) => cell.textContent)).toEqual([
            "Our bank details changed.\nPay DE89…3000 today.email:b…@acme-billing.net",
            "payment_fraud48% sure",
            "—",
            "5 min ago",
            "Review",
        ]);
        expect(rows[2]!.textContent).toContain("tax_notice");

        fireEvent.click(screen.getByRole("button", { name: "Review the chunk from web:tax.example" }));
        expect(onReview).toHaveBeenCalledWith(taxNotice());
    });
});
