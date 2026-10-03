import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Input, Textarea } from "./input";

describe("Input", () => {
    it("is a text field that reports typing", () => {
        const onChange = vi.fn();
        render(<Input aria-label="Name" onChange={onChange} />);
        const input = screen.getByRole<HTMLInputElement>("textbox", { name: "Name" });
        expect(input.type).toBe("text");
        expect(input.className).toContain("py-[10px]");
        fireEvent.change(input, { target: { value: "billing" } });
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(input.value).toBe("billing");
    });

    it("can be compact, mono and of another type", () => {
        render(<Input aria-label="Email" type="email" compact mono />);
        const input = screen.getByRole<HTMLInputElement>("textbox", { name: "Email" });
        expect(input.type).toBe("email");
        expect(input.className.split(" ")).toEqual(expect.arrayContaining(["mono", "py-[9px]"]));
    });
});

describe("Textarea", () => {
    it("has four rows unless told otherwise", () => {
        render(
            <>
                <Textarea aria-label="Policy" />
                <Textarea aria-label="Notes" rows={8} className="extra" />
            </>,
        );
        expect(screen.getByRole("textbox", { name: "Policy" }).getAttribute("rows")).toBe("4");
        const notes = screen.getByRole("textbox", { name: "Notes" });
        expect(notes.getAttribute("rows")).toBe("8");
        expect(notes.className).toContain("extra");
    });
});
