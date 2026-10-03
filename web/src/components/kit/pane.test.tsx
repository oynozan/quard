import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Pane } from "./pane";

describe("Pane", () => {
    it("names its region by the title and shows the tag and actions in the header", () => {
        render(
            <Pane title="Live log" tag="tail -f" actions={<button type="button">Pause</button>}>
                <p>line one</p>
            </Pane>,
        );
        const region = screen.getByRole("region", { name: "Live log" });
        expect(screen.getByRole("heading", { level: 2, name: "Live log" })).toBeTruthy();
        expect(screen.getByText("tail -f")).toBeTruthy();
        expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
        expect(region.textContent).toContain("line one");
    });

    it("shows only the title in the header without a tag or actions", () => {
        const { container } = render(<Pane title="Events">body</Pane>);
        const side = container.querySelector("header > div");
        expect(side?.children).toHaveLength(0);
    });
});
