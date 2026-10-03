import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FieldMessage, SweepLayer, YAxis } from "./field-parts";

const TICKS = [
    { label: "50", y: 40 },
    { label: "100", y: 20 },
];

function labels(container: HTMLElement) {
    return [...(container.firstElementChild as HTMLElement).children] as HTMLElement[];
}

describe("YAxis", () => {
    it("shows each tick label on its gridline and a zero at the bottom", () => {
        const { container } = render(<YAxis ticks={TICKS} height={60} state="ready" />);
        const spans = labels(container);
        expect(spans.map((s) => s.textContent)).toEqual(["50", "100", "0"]);
        expect(spans.map((s) => s.style.top)).toEqual(["35px", "15px", "50px"]);
        expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
        expect((container.firstElementChild as HTMLElement).style.height).toBe("60px");
    });

    it("shows dashes instead of numbers when there is no data", () => {
        const { container } = render(<YAxis ticks={TICKS} height={60} state="empty" />);
        expect(labels(container).map((s) => s.textContent)).toEqual(["—", "—", "—"]);
    });

    it("shows grey bars in place of every label while loading", () => {
        const { container } = render(<YAxis ticks={TICKS} height={60} state="loading" />);
        const bars = [...container.querySelectorAll(".skel")] as HTMLElement[];
        expect(bars.map((b) => b.style.width)).toEqual(["16px", "16px", "8px"]);
        expect(container.textContent).toBe("");
    });

    it("keeps the last labels while refetching", () => {
        const { container } = render(<YAxis ticks={TICKS} height={60} state="refetching" />);
        expect(container.textContent).toBe("501000");
    });
});

describe("FieldMessage", () => {
    it("places the sentence over the knocked-out box", () => {
        const { getByText } = render(<FieldMessage text="No calls yet" box={{ x: 10, y: 20, w: 120, h: 30 }} />);
        const message = getByText("No calls yet");
        expect(message.style.left).toBe("10px");
        expect(message.style.top).toBe("20px");
        expect(message.style.width).toBe("120px");
        expect(message.style.height).toBe("30px");
    });

    it("shifts by the axis offset when given one", () => {
        const { getByText } = render(
            <FieldMessage text="Could not load" box={{ x: 10, y: 0, w: 50, h: 10 }} left={40} />,
        );
        expect(getByText("Could not load").style.left).toBe("50px");
    });
});

describe("SweepLayer", () => {
    it("draws one path per band that has cells and skips empty bands", () => {
        const { container } = render(
            <svg>
                <SweepLayer
                    paths={[
                        { fill: "var(--segment-off)", d: "M0 0h4v4h-4z" },
                        { fill: "var(--line)", d: "" },
                        { fill: "var(--control)", d: "M6 0h4v4h-4z" },
                    ]}
                />
            </svg>,
        );
        const paths = [...container.querySelectorAll("path")];
        expect(paths.map((p) => p.getAttribute("fill"))).toEqual(["var(--segment-off)", "var(--control)"]);
        expect(paths[1].getAttribute("d")).toBe("M6 0h4v4h-4z");
    });

    it("draws nothing without a sweep", () => {
        const { container } = render(
            <svg>
                <SweepLayer paths={[]} />
            </svg>,
        );
        expect(container.querySelectorAll("path")).toHaveLength(0);
    });
});
