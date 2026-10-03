import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Absent, DetailList, DetailRow, StatusValue, Unknown } from "./detail-list";

describe("DetailList", () => {
    it("pairs each term with its value", () => {
        const { container } = render(
            <DetailList>
                <DetailRow term="Model" mono title="gpt-5-2026">
                    gpt-5
                </DetailRow>
                <DetailRow term="Owner">
                    <Absent>Not set</Absent>
                </DetailRow>
            </DetailList>,
        );
        const terms = [...container.querySelectorAll("dt")].map((dt) => dt.textContent);
        const values = [...container.querySelectorAll("dd")];
        expect(terms).toEqual(["Model", "Owner"]);
        expect(values.map((dd) => dd.textContent)).toEqual(["gpt-5", "Not set"]);
        expect(values[0].getAttribute("title")).toBe("gpt-5-2026");
        expect(values[0].className.split(" ")).toContain("mono");
        expect(values[1].className.split(" ")).not.toContain("mono");
    });
});

describe("StatusValue", () => {
    it("writes the word beside a square of its tone", () => {
        const { container } = render(<StatusValue tone="warning">Waiting</StatusValue>);
        expect(container.textContent).toBe("Waiting");
        expect(container.querySelector("[aria-hidden]")?.className).toContain("bg-warning");
    });
});

describe("Unknown", () => {
    it("shows a dash and tells screen readers the value is unknown", () => {
        render(<Unknown />);
        expect(screen.getByText("—").getAttribute("aria-hidden")).toBe("true");
        expect(screen.getByText("Unknown").className).toBe("sr-only");
    });
});
