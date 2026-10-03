import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button, buttonVariants } from "./button";

describe("Button", () => {
    it("is an outlined button that reports clicks", () => {
        const onClick = vi.fn();
        render(<Button onClick={onClick}>Save</Button>);
        const button = screen.getByRole("button", { name: "Save" });
        expect(button.getAttribute("data-slot")).toBe("button");
        expect(button.className).toContain("bg-control-hover");
        expect(button.getAttribute("aria-busy")).toBeNull();
        fireEvent.click(button);
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("shows a spinner and blocks clicks while busy", () => {
        const onClick = vi.fn();
        render(
            <Button busy onClick={onClick}>
                Saving…
            </Button>,
        );
        const button = screen.getByRole("button", { name: "Saving…" });
        expect(button.hasAttribute("disabled")).toBe(true);
        expect(button.getAttribute("aria-busy")).toBe("true");
        expect(button.querySelector(".spinner")).toBeTruthy();
        fireEvent.click(button);
        expect(onClick).not.toHaveBeenCalled();
    });

    it("can be disabled without a spinner", () => {
        render(<Button disabled>Save</Button>);
        const button = screen.getByRole("button", { name: "Save" });
        expect(button.hasAttribute("disabled")).toBe(true);
        expect(button.querySelector(".spinner")).toBeNull();
    });

    it("takes the variant and size it is given", () => {
        render(
            <Button variant="default" size="sm" className="extra">
                Create
            </Button>,
        );
        const classes = screen.getByRole("button", { name: "Create" }).className;
        expect(classes).toContain("bg-signal");
        expect(classes).toContain("min-h-[30px]");
        expect(classes).toContain("extra");
    });
});

describe("buttonVariants", () => {
    it("styles a link with no padding", () => {
        const classes = buttonVariants({ variant: "link" }).split(" ");
        expect(classes).toEqual(expect.arrayContaining(["text-ink-link", "px-0", "py-0"]));
    });
});
