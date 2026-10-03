import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeResizeObserver, observers, resizeAll } from "../../../test/charts-rest/dom";
import { HeroChart } from "./hero-chart";

// 144 ten-minute buckets ending at noon on 1 May: 100 each, a 900 peak at 20:20 and 120 now
const ENDS_AT = Date.UTC(2026, 4, 1, 12, 0);
const VALUES = Array.from({ length: 144 }, (_, i) => (i === 50 ? 900 : i === 143 ? 120 : 100));

function hero(live?: boolean) {
    return render(<HeroChart greeting="Good morning, Ada" values={VALUES} endsAt={ENDS_AT} live={live} />);
}

function chart() {
    return screen.getByRole("img", { name: /^Model calls per/ });
}

function tooltip() {
    return document.querySelector('[role="presentation"]') as HTMLElement | null;
}

function announcement() {
    return document.querySelector('p[aria-live="polite"]')?.textContent;
}

// The x labels under the field: four times, then "now", then the hovered time
// The x of every cell in a path, for checking which column it covers
function columnXs(container: HTMLElement, fill: string) {
    const d = container.querySelector(`path[fill="${fill}"]`)?.getAttribute("d") ?? "";
    return [...new Set([...d.matchAll(/M([\d.]+) /g)].map((m) => m[1]))];
}

function xLabels() {
    return [...(chart().nextElementSibling as HTMLElement).children] as HTMLElement[];
}

beforeEach(() => {
    observers.length = 0;
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("HeroChart", () => {
    it("greets the reader and sums up the day in the chart's label", () => {
        hero();
        expect(screen.getByRole("region", { name: "Model calls in the last 24 hours" })).toBeTruthy();
        expect(screen.getByRole("heading", { level: 1, name: "Good morning, Ada" })).toBeTruthy();
        expect(chart().getAttribute("aria-label")).toBe(
            "Model calls per 10 min over the last 24 hours. Peak 900 at 20:20, now 120.",
        );
        expect(chart().getAttribute("width")).toBe("978");
    });

    it("shows the day's total, the live mark and a blinking cursor", () => {
        const { container } = hero();
        expect(screen.getByText("Model calls per 10 min").parentElement?.textContent).toBe(
            "Model calls per 10 min15,220in 24h",
        );
        expect(screen.getByText("Live")).toBeTruthy();
        expect(container.querySelector("rect.cursor-blink")).toBeTruthy();
    });

    it("drops the cursor and says Offline when the feed is down", () => {
        const { container } = hero(false);
        expect(screen.getByText("Offline")).toBeTruthy();
        expect(container.querySelector("rect.cursor-blink")).toBeNull();
    });

    it("labels the y gridlines and the times along the bottom", () => {
        const { container } = hero();
        const axis = container.querySelector("div[aria-hidden].mono.pointer-events-none") as HTMLElement;
        expect(axis.textContent).toBe("3006009000");
        expect(axis.className).not.toContain(" opacity-100");
        expect(container.querySelectorAll('rect[fill="var(--chart-grid)"]')).toHaveLength(3);
        expect(xLabels().map((s) => s.textContent)).toEqual(["12:00", "18:00", "00:00", "06:00", "now"]);
        expect(xLabels().every((s) => s.style.opacity === "1")).toBe(true);
    });

    it("draws an unlit field and a zero peak before the first call", () => {
        const { container } = render(<HeroChart greeting="Hello" values={VALUES.map(() => 0)} endsAt={ENDS_AT} />);
        expect(chart().getAttribute("aria-label")).toBe(
            "Model calls per 10 min over the last 24 hours. Peak 0 at 12:00, now 0.",
        );
        expect(container.querySelector('path[fill="var(--signal)"]')?.getAttribute("d")).toBe("");
    });

    it("merges buckets into 20 minute columns on a narrow screen", () => {
        hero();
        resizeAll(600);
        expect(chart().getAttribute("aria-label")).toBe(
            "Model calls per 20 min over the last 24 hours. Peak 1,000 at 20:20, now 220.",
        );
        expect(screen.getByText("Model calls per 20 min")).toBeTruthy();
    });

    it("lays out at least 240px wide, merging into hour columns", () => {
        hero();
        resizeAll(100);
        expect(chart().getAttribute("width")).toBe("240");
        expect(chart().getAttribute("aria-label")).toBe(
            "Model calls per 60 min over the last 24 hours. Peak 1,400 at 20:00, now 620.",
        );
    });

    it("lists every bucket in the table and switches back to the chart", () => {
        hero();
        fireEvent.click(screen.getByRole("button", { name: "Table" }));
        expect(screen.queryByRole("img")).toBeNull();
        const rows = screen.getAllByRole("row");
        expect(rows[0].textContent).toBe("TimeModel calls");
        expect(rows).toHaveLength(145);
        expect(rows[1].textContent).toBe("12:00100");
        expect(rows[51].textContent).toBe("20:20900");
        fireEvent.click(screen.getByRole("button", { name: "Chart" }));
        expect(chart()).toBeTruthy();
    });
});

describe("HeroChart hover", () => {
    it("starts keyboard reading from the newest bucket and steps back with the left arrow", () => {
        const { container } = hero();
        expect(announcement()).toBe("");
        expect(fireEvent.keyDown(chart(), { key: "ArrowLeft" })).toBe(false);
        expect(tooltip()?.textContent).toBe("100calls11:40–11:50");
        // Bucket 142 starts at x 852; 100 of 900 calls lifts the tip to 130px
        expect(tooltip()?.style.right).toBe("calc(100% - 842px)");
        expect(tooltip()?.style.top).toBe("130px");
        expect(announcement()).toBe("100 calls, 11:40");
        expect(columnXs(container, "var(--mint)")).toEqual(["852"]);
        expect(columnXs(container, "var(--highlight)")).toEqual(["852"]);
        fireEvent.keyDown(chart(), { key: "ArrowRight" });
        fireEvent.keyDown(chart(), { key: "ArrowRight" });
        expect(tooltip()?.textContent).toBe("120calls11:50–12:00");
    });

    it("hides the nearby time labels and shows the y ticks while hovering", () => {
        const { container } = hero();
        fireEvent.keyDown(chart(), { key: "End" });
        const labels = xLabels();
        expect(labels.map((s) => s.textContent)).toEqual(["12:00", "18:00", "00:00", "06:00", "now", "11:50"]);
        expect(labels.slice(0, 4).map((s) => s.style.opacity)).toEqual(["1", "1", "1", "1"]);
        expect(labels[4].style.opacity).toBe("0");
        expect(labels[5].style.left).toBe("846px");
        const axis = container.querySelector("div[aria-hidden].mono.pointer-events-none") as HTMLElement;
        expect(axis.className).toContain(" opacity-100");
    });

    it("jumps to the first bucket with Home and stays there", () => {
        hero();
        fireEvent.keyDown(chart(), { key: "Home" });
        expect(tooltip()?.textContent).toBe("100calls12:00–12:10");
        expect(tooltip()?.style.left).toBe("16px");
        fireEvent.keyDown(chart(), { key: "ArrowLeft" });
        expect(announcement()).toBe("100 calls, 12:00");
        expect(xLabels()[0].style.opacity).toBe("0");
        expect(xLabels()[1].style.opacity).toBe("1");
        expect(xLabels()[5].style.left).toBe("0px");
    });

    it("ignores other keys and clears with Escape or on blur", () => {
        hero();
        expect(fireEvent.keyDown(chart(), { key: "Enter" })).toBe(true);
        expect(tooltip()).toBeNull();
        fireEvent.keyDown(chart(), { key: "Home" });
        fireEvent.keyDown(chart(), { key: "Escape" });
        expect(tooltip()).toBeNull();
        expect(announcement()).toBe("");
        fireEvent.keyDown(chart(), { key: "End" });
        fireEvent.blur(chart());
        expect(tooltip()).toBeNull();
    });

    it("follows the pointer column by column and clears when it leaves", () => {
        hero();
        vi.spyOn(chart(), "getBoundingClientRect").mockReturnValue({ left: 50 } as DOMRect);
        // Columns are 6px apart, so 300px in is bucket 50
        fireEvent.pointerMove(chart(), { clientX: 350 });
        expect(tooltip()?.textContent).toBe("900calls20:20–20:30");
        // The peak column reaches the top, so the tip stops there
        expect(tooltip()?.style.top).toBe("0px");
        fireEvent.pointerMove(chart(), { clientX: 5000 });
        expect(announcement()).toBe("120 calls, 11:50");
        fireEvent.pointerMove(chart(), { clientX: 0 });
        expect(announcement()).toBe("100 calls, 12:00");
        fireEvent.pointerLeave(chart());
        expect(tooltip()).toBeNull();
    });
});
