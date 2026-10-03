import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { ChartPane, type ChartState, type ReadoutItem } from "./chart-pane";

const READOUTS: ReadoutItem[] = [
    { label: "Peak", value: "1,204", suffix: "calls" },
    { label: "Now", value: "88" },
];

function pane(props: { state?: ChartState; tag?: string; readouts?: ReadoutItem[]; legend?: ReactNode } = {}) {
    return render(
        <ChartPane title="Model calls" table={<p>The table</p>} {...props}>
            <p>The chart</p>
        </ChartPane>,
    );
}

function chartWrapper() {
    return screen.getByText("The chart").parentElement as HTMLElement;
}

describe("ChartPane", () => {
    it("labels the pane with its title and shows the chart with its tag and readouts", () => {
        const { container } = pane({ tag: "24H", readouts: READOUTS });
        const section = screen.getByRole("region", { name: "Model calls" });
        expect(section.getAttribute("aria-busy")).toBeNull();
        expect(screen.getByRole("heading", { level: 2, name: "Model calls" })).toBeTruthy();
        expect(screen.getByText("24H")).toBeTruthy();
        expect(screen.getByText("Peak").parentElement?.textContent).toBe("Peak1,204calls");
        expect(screen.getByText("Now").parentElement?.textContent).toBe("Now88");
        expect(chartWrapper().className).not.toContain("opacity-45");
        // The divider sits between the tag and the Table toggle
        expect(container.querySelectorAll("header .w-px")).toHaveLength(1);
        expect(container.querySelector(".spinner")).toBeNull();
    });

    it("swaps the chart for the table and back", () => {
        pane({ readouts: READOUTS });
        fireEvent.click(screen.getByRole("button", { name: "Table" }));
        expect(screen.getByText("The table")).toBeTruthy();
        expect(screen.queryByText("The chart")).toBeNull();
        expect(screen.queryByText("Peak")).toBeNull();
        const back = screen.getByRole("button", { name: "Chart" });
        expect(back.getAttribute("aria-pressed")).toBe("true");
        fireEvent.click(back);
        expect(screen.getByText("The chart")).toBeTruthy();
        expect(screen.queryByText("The table")).toBeNull();
    });

    it("leaves out the readout row and the divider when there is nothing to show", () => {
        const { container } = pane();
        expect(container.querySelector(".mb-3")).toBeNull();
        expect(container.querySelectorAll("header .w-px")).toHaveLength(0);
    });

    it("shows a legend on its own at the end of the readout row", () => {
        pane({ legend: <span>Heat scale</span> });
        const row = screen.getByText("Heat scale").parentElement as HTMLElement;
        expect(row.className).toContain("justify-between");
        expect(row.firstElementChild?.children).toHaveLength(0);
    });

    it("marks the pane busy and shows grey bars for the readouts while loading", () => {
        const { container } = pane({ readouts: READOUTS, state: "loading" });
        expect(screen.getByRole("region").getAttribute("aria-busy")).toBe("true");
        expect(screen.queryByText("1,204")).toBeNull();
        const bars = [...container.querySelectorAll(".skel")] as HTMLElement[];
        // Five characters get 30px; two get the 16px minimum
        expect(bars.map((b) => b.style.width)).toEqual(["30px", "16px"]);
    });

    it("shows dashes for the readouts when there is no data", () => {
        pane({ readouts: READOUTS, state: "empty" });
        expect(screen.getByRole("region").getAttribute("aria-busy")).toBeNull();
        expect(screen.getByText("Peak").parentElement?.textContent).toBe("Peak—calls");
        expect(screen.getByText("Now").parentElement?.textContent).toBe("Now—");
    });

    it("dims the last frame and spins before the toggle while refetching", () => {
        const { container } = pane({ readouts: READOUTS, state: "refetching" });
        expect(screen.getByRole("region").getAttribute("aria-busy")).toBe("true");
        expect(container.querySelector("header .spinner")).toBeTruthy();
        expect(container.querySelectorAll("header .w-px")).toHaveLength(1);
        expect(screen.getByText("1,204")).toBeTruthy();
        expect(chartWrapper().className).toContain("opacity-45");
    });
});
