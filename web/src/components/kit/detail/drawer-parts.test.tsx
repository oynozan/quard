import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { stubClipboard, unstubClipboard } from "../../../../test/ui-kit-metal/clipboard";
import { DrawerActions, DrawerSection, IdentifierRow } from "./drawer-parts";

afterEach(unstubClipboard);

describe("IdentifierRow", () => {
    it("shows the full identifier with a Copy button that copies it", async () => {
        const writeText = stubClipboard();
        render(<IdentifierRow value="ag_0123456789" />);
        expect(screen.getByText("ag_0123456789")).toBeTruthy();
        const button = screen.getByRole("button");
        expect(button.querySelector(".grid")?.lastElementChild?.textContent).toBe("Copy");
        await act(async () => {
            fireEvent.click(button);
        });
        expect(writeText).toHaveBeenCalledWith("ag_0123456789");
    });
});

describe("DrawerSection", () => {
    it("opens with its title", () => {
        render(<DrawerSection title="Tools">list</DrawerSection>);
        expect(screen.getByRole("heading", { level: 3, name: "Tools" })).toBeTruthy();
    });

    it("has no heading without a title", () => {
        render(<DrawerSection>list</DrawerSection>);
        expect(screen.queryByRole("heading")).toBeNull();
    });
});

describe("DrawerActions", () => {
    it("shows the actions with the cancel under them", () => {
        const { container } = render(
            <DrawerActions cancel={<button type="button">Cancel</button>}>
                <button type="button">Save</button>
            </DrawerActions>,
        );
        expect(container.firstElementChild?.children).toHaveLength(2);
        expect(container.firstElementChild?.lastElementChild?.textContent).toBe("Cancel");
    });

    it("shows only the actions without a cancel", () => {
        const { container } = render(
            <DrawerActions>
                <button type="button">Save</button>
            </DrawerActions>,
        );
        expect(container.firstElementChild?.children).toHaveLength(1);
    });
});
