import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { Drawer } from "./drawer";
import { Hint } from "./hint";

function content() {
    return screen.getByRole("heading", { name: "Add agent" }).parentElement as HTMLElement;
}

describe("Drawer", () => {
    it("shows nothing while closed", () => {
        render(
            <Drawer open={false} onOpenChange={vi.fn()} title="Add agent">
                body
            </Drawer>,
        );
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("opens as a dialog named by its title, and closes from the close button", () => {
        const onOpenChange = vi.fn();
        render(
            <Drawer open onOpenChange={onOpenChange} title="Add agent" className="extra">
                <p>Pick a name</p>
            </Drawer>,
        );
        const dialog = screen.getByRole("dialog", { name: "Add agent" });
        expect(dialog.className).toContain("extra");
        expect(screen.getByText("Pick a name")).toBeTruthy();
        expect(content().className).toBe("");
        fireEvent.click(screen.getByRole("button", { name: "Close" }));
        expect(onOpenChange.mock.calls[0][0]).toBe(false);
    });

    it("fades new content in when the view switches while open", () => {
        const { rerender } = render(
            <Drawer open onOpenChange={vi.fn()} title="Add agent">
                step one
            </Drawer>,
        );
        rerender(
            <Drawer open onOpenChange={vi.fn()} title="Add agent" view="confirm">
                step two
            </Drawer>,
        );
        expect(content().className).toBe("reveal");
        expect(content().textContent).toBe("Add agentstep two");
    });

    it("opens without the fade even when the view changed while closed", () => {
        const props = { onOpenChange: vi.fn(), title: "Add agent", children: "body" };
        const { rerender } = render(<Drawer open={false} {...props} />);
        rerender(<Drawer open={false} view="confirm" {...props} />);
        rerender(<Drawer open view="confirm" {...props} />);
        expect(content().className).toBe("");
    });

    it("moves focus to the field it is pointed at", async () => {
        function WithFocus() {
            const ref = useRef<HTMLInputElement>(null);
            return (
                <Drawer open onOpenChange={vi.fn()} title="Add agent" initialFocus={ref}>
                    <input ref={ref} aria-label="Name" />
                </Drawer>
            );
        }
        render(<WithFocus />);
        const name = screen.getByRole("textbox", { name: "Name" });
        await waitFor(() => expect(document.activeElement).toBe(name));
    });

    it("keeps hints from its content inside the sheet", () => {
        render(
            <Drawer open onOpenChange={vi.fn()} title="Add agent">
                <Hint content="Lowercase only">
                    <button type="button">Name rules</button>
                </Hint>
            </Drawer>,
        );
        fireEvent.focus(screen.getByRole("button", { name: "Name rules" }));
        expect(screen.getByRole("dialog").contains(screen.getByText("Lowercase only"))).toBe(true);
    });
});
