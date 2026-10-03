import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RefreshButton, Toolbar, ToolbarSpacer } from "./toolbar";

describe("Toolbar", () => {
    it("holds its controls in order, with a hidden spacer pushing refresh right", () => {
        const { container } = render(
            <Toolbar className="extra">
                <input aria-label="Search" />
                <ToolbarSpacer />
                <RefreshButton />
            </Toolbar>,
        );
        const row = container.firstElementChild as HTMLElement;
        expect(row.className).toContain("extra");
        const [search, spacer, refresh] = [...row.children];
        expect(search).toBe(screen.getByRole("textbox", { name: "Search" }));
        expect(spacer.getAttribute("aria-hidden")).toBe("true");
        expect(spacer.className).toBe("ml-auto");
        expect(refresh).toBe(screen.getByRole("button", { name: "Refresh" }));
    });
});

describe("RefreshButton", () => {
    it("is a ready refresh icon button at rest that reports clicks", () => {
        const onClick = vi.fn();
        render(<RefreshButton onClick={onClick} />);
        const button = screen.getByRole("button", { name: "Refresh" });
        expect(button.getAttribute("title")).toBe("Refresh");
        expect(button.hasAttribute("disabled")).toBe(false);
        expect(button.getAttribute("aria-busy")).toBeNull();
        expect(button.querySelector("svg")).toBeTruthy();
        fireEvent.click(button);
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("shows the spinner and stays disabled while busy", () => {
        render(<RefreshButton busy />);
        const button = screen.getByRole("button", { name: "Refresh" });
        expect(button.hasAttribute("disabled")).toBe(true);
        expect(button.getAttribute("aria-busy")).toBe("true");
        expect(button.querySelector(".spinner")).toBeTruthy();
        expect(button.querySelector("svg")).toBeNull();
    });

    it("can be disabled without being busy", () => {
        render(<RefreshButton disabled />);
        const button = screen.getByRole("button", { name: "Refresh" });
        expect(button.hasAttribute("disabled")).toBe(true);
        expect(button.getAttribute("aria-busy")).toBeNull();
    });
});
