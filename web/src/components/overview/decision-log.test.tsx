import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoChartsOrTables } from "../../../test/empty";
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

    it("shows only its title and one line when nothing was decided, with no live mark or cursor", () => {
        const { container } = render(<DecisionLog events={[]} />);

        expect(pane().getByRole("heading").textContent).toBe("Decision log");
        expect(pane().getByRole("status").textContent).toBe("No guard decisions in the last 24 hours");
        expect(screen.queryByText("Live")).toBeNull();
        expect(screen.queryByRole("list")).toBeNull();
        expect(container.querySelector(".cursor-blink")).toBeNull();
        expectNoChartsOrTables(container);
    });
});
