import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { getApprovals } from "@/lib/data/approvals/query";
import ApprovalsPage, { metadata } from "./page";

describe("ApprovalsPage", () => {
    it("titles the tab", () => {
        expect(metadata.title).toBe("Approvals");
    });

    it("shows every open request on the board", async () => {
        const data = await getApprovals();
        render(await ApprovalsPage());
        expect(screen.getByRole("heading", { level: 1, name: "Approvals" })).toBeTruthy();
        const waiting = screen.getByRole("heading", { level: 2, name: /^Waiting for an answer/ });
        expect(waiting.textContent).toBe(`Waiting for an answer${data.open.length}`);
    });
});
