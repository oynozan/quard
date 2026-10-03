import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { logLine } from "../../../test/overview/fixtures";
import { DecisionLog } from "./decision-log";

const pane = () => within(screen.getByRole("region", { name: "Decision log" }));

describe("DecisionLog", () => {
    it("tails the latest decisions under a live mark", () => {
        const { container } = render(<DecisionLog events={[logLine({ tool: "fetch_page" }), logLine()]} />);

        expect(pane().getByText("Live")).toBeTruthy();
        expect(pane().getAllByRole("listitem")).toHaveLength(2);
        expect(container.querySelector(".cursor-blink")).toBeTruthy();
    });

    it("keeps its title, live mark and cursor with one quiet line when nothing was decided", () => {
        const { container } = render(<DecisionLog events={[]} />);

        expect(pane().getByRole("heading").textContent).toBe("Decision log");
        expect(pane().getByText("Live")).toBeTruthy();
        expect(pane().getByText("No guard decisions in the last 24 hours")).toBeTruthy();
        expect(container.querySelector(".cursor-blink")).toBeTruthy();
    });
});
