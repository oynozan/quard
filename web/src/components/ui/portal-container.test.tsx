import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PortalContainerProvider, usePortalContainer } from "./portal-container";

function Probe() {
    const container = usePortalContainer();
    return <span>{container ? container.id : "page"}</span>;
}

describe("usePortalContainer", () => {
    it("is undefined outside a provider, so menus portal to the page", () => {
        render(<Probe />);
        expect(screen.getByText("page")).toBeTruthy();
    });

    it("returns the element a drawer provides", () => {
        const sheet = document.createElement("div");
        sheet.id = "sheet";
        render(
            <PortalContainerProvider value={sheet}>
                <Probe />
            </PortalContainerProvider>,
        );
        expect(screen.getByText("sheet")).toBeTruthy();
    });
});
