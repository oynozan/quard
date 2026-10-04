import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReviewerNote } from "./reviewer-note";

const WRITTEN = Date.UTC(2026, 9, 3, 14, 5, 0);

describe("ReviewerNote", () => {
    it("shows the reviewer's words with its model, cost and time", () => {
        render(
            <ReviewerNote
                note={{
                    model: "claude-haiku",
                    costUsd: 0.0123,
                    writtenAt: WRITTEN,
                    paragraphs: ["The agent trusted a page it fetched."],
                }}
            />,
        );
        expect(screen.getByRole("heading", { name: "AI explanation" })).toBeTruthy();
        expect(screen.getByRole("heading", { name: "AI reviewer" })).toBeTruthy();
        expect(screen.getByText("not the verdict")).toBeTruthy();
        expect(screen.getByText("The agent trusted a page it fetched.")).toBeTruthy();
        const meta = screen.getByText("claude-haiku · $0.0123 · 14:05 UTC");
        expect(meta.getAttribute("title")).toBe("Written at 14:05 UTC with your provider key");
        expect(screen.queryByText("No explanation yet")).toBeNull();
    });

    it("keeps the reviewer pane and says there is no explanation yet without a note", () => {
        render(<ReviewerNote note={null} />);
        expect(screen.getByRole("heading", { name: "AI explanation" })).toBeTruthy();
        const [, pane] = screen.getAllByRole("region", { name: "AI reviewer" });
        expect(within(pane).getByRole("heading", { name: "AI reviewer" })).toBeTruthy();
        expect(within(pane).getByText("not the verdict")).toBeTruthy();
        expect(within(pane).getByRole("status").textContent).toBe("No explanation yet");
        expect(pane.textContent).toBe("AI reviewernot the verdictNo explanation yet");
    });

    it("says why there is no note when told", () => {
        render(<ReviewerNote note={null} empty="Skipped: the worker has no provider key" />);
        expect(screen.getByRole("status").textContent).toBe("Skipped: the worker has no provider key");
    });
});
