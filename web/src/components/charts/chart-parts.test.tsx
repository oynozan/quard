import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChartTooltip, HeaderDivider, LiveMark, Readout, TableToggle } from "./chart-parts";

describe("LiveMark", () => {
    it("says Live with a filled green square", () => {
        const { container } = render(<LiveMark />);
        expect(container.textContent).toBe("Live");
        expect(container.querySelector("[aria-hidden]")?.className).toContain("bg-signal");
    });
});

describe("TableToggle", () => {
    it("offers the table while the chart shows and calls back on click", () => {
        const onToggle = vi.fn();
        render(<TableToggle pressed={false} onToggle={onToggle} />);
        const button = screen.getByRole("button", { name: "Table" });
        expect(button.getAttribute("aria-pressed")).toBe("false");
        fireEvent.click(button);
        expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it("offers the chart back while the table shows", () => {
        render(<TableToggle pressed onToggle={() => {}} />);
        expect(screen.getByRole("button", { name: "Chart" }).getAttribute("aria-pressed")).toBe("true");
    });
});

describe("HeaderDivider", () => {
    it("is hidden from assistive tech", () => {
        const { container } = render(<HeaderDivider />);
        expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
    });
});

describe("Readout", () => {
    it("shows the label, the value and a suffix", () => {
        const { container } = render(<Readout label="Calls" value="1,204" suffix="in 24h" />);
        expect(container.textContent).toBe("Calls1,204in 24h");
    });

    it("leaves the suffix out when none is given", () => {
        const { container } = render(<Readout label="Calls" value="1,204" />);
        expect(container.firstElementChild?.children).toHaveLength(2);
        expect(container.textContent).toBe("Calls1,204");
    });
});

describe("ChartTooltip", () => {
    const base = { x: 120, y: 30, value: "42", unit: "calls", caption: "10:00–10:10" };

    it("shows the value, unit and caption, anchored left of the point", () => {
        const { container } = render(<ChartTooltip {...base} alignRight={false} />);
        const tip = container.querySelector('[role="presentation"]') as HTMLElement;
        expect(tip.textContent).toBe("42calls10:00–10:10");
        expect(tip.style.left).toBe("120px");
        expect(tip.style.top).toBe("30px");
        expect(tip.style.right).toBe("");
        expect((tip.querySelector("[aria-hidden]") as HTMLElement).style.background).toBe("var(--mint)");
    });

    it("hangs to the left of the point near the right edge, in the given key color", () => {
        const { container } = render(<ChartTooltip {...base} alignRight keyColor="var(--warning)" />);
        const tip = container.querySelector('[role="presentation"]') as HTMLElement;
        expect(tip.style.right).toBe("calc(100% - 120px)");
        expect(tip.style.left).toBe("");
        expect((tip.querySelector("[aria-hidden]") as HTMLElement).style.background).toBe("var(--warning)");
    });
});
