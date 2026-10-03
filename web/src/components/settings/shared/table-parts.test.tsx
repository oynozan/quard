import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MINUTE, NOW } from "@/lib/data/rng";
import { Ago, Cols, Head, Quiet, ShortDate } from "./table-parts";

describe("Cols", () => {
    it("puts the 44px selection slot before the given widths", () => {
        const { container } = render(
            <table>
                <Cols widths={["60%", "40%"]} />
            </table>,
        );
        const widths = [...container.querySelectorAll("col")].map((col) => col.style.width);
        expect(widths).toEqual(["44px", "60%", "40%"]);
    });
});

describe("Head", () => {
    it("spans the first header over the selection slot, then lists the rest", () => {
        render(
            <table>
                <Head first="Key" rest={["Owner", <span key="a">Actions</span>]} />
            </table>,
        );
        const cells = screen.getAllByRole("columnheader");
        expect(cells.map((cell) => cell.textContent)).toEqual(["Key", "Owner", "Actions"]);
        expect(cells[0].getAttribute("colspan")).toBe("2");
    });
});

describe("ShortDate", () => {
    it("shows the short date with the long form and machine time attached", () => {
        render(<ShortDate time={NOW} className="extra" />);
        const time = screen.getByText("3 Oct");
        expect(time.tagName).toBe("TIME");
        expect(time.getAttribute("dateTime")).toBe("2026-10-03T18:40:00.000Z");
        expect(time.getAttribute("title")).toBe("3 October 2026 at 18:40");
        expect(time.className).toContain("extra");
    });
});

describe("Ago", () => {
    it("shows how long ago with the number in mono", () => {
        const { container } = render(<Ago time={NOW - 12 * MINUTE} now={NOW} />);
        const time = container.querySelector("time");
        expect(time?.textContent).toBe("12 min ago");
        expect(time?.querySelector(".mono")?.textContent).toBe("12");
        expect(time?.getAttribute("dateTime")).toBe("2026-10-03T18:28:00.000Z");
        expect(time?.getAttribute("title")).toBe("3 October 2026 at 18:28");
    });
});

describe("Quiet", () => {
    it("shows a secondary line with an optional tooltip in mono", () => {
        render(
            <Quiet mono title="billing, support">
                billing, support
            </Quiet>,
        );
        const line = screen.getByText("billing, support");
        expect(line.getAttribute("title")).toBe("billing, support");
        expect(line.classList.contains("mono")).toBe(true);
    });

    it("stays in the text face without a title by default", () => {
        render(<Quiet>Whole run</Quiet>);
        const line = screen.getByText("Whole run");
        expect(line.getAttribute("title")).toBeNull();
        expect(line.classList.contains("mono")).toBe(false);
    });
});
