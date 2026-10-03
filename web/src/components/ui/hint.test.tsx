import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Hint } from "./hint";
import { PortalContainerProvider } from "./portal-container";

function popup() {
    return screen.getByText("Runs over budget stop here");
}

describe("Hint", () => {
    it("explains its control above it while focused", () => {
        render(
            <Hint content="Runs over budget stop here">
                <button type="button">Budget</button>
            </Hint>,
        );
        expect(screen.queryByText("Runs over budget stop here")).toBeNull();
        fireEvent.focus(screen.getByRole("button", { name: "Budget" }));
        expect(popup().getAttribute("data-side")).toBe("top");
    });

    it("opens on the side it is given, inside the drawer that holds it", () => {
        const sheet = document.createElement("div");
        document.body.append(sheet);
        render(
            <PortalContainerProvider value={sheet}>
                <Hint content="Runs over budget stop here" side="bottom">
                    <button type="button">Budget</button>
                </Hint>
            </PortalContainerProvider>,
        );
        fireEvent.focus(screen.getByRole("button", { name: "Budget" }));
        expect(popup().getAttribute("data-side")).toBe("bottom");
        expect(sheet.contains(popup())).toBe(true);
        sheet.remove();
    });
});
