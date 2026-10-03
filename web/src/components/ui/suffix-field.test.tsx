import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SuffixField } from "./suffix-field";

describe("SuffixField", () => {
    it("shows the fixed suffix after the value the person types", () => {
        const onChange = vi.fn();
        render(<SuffixField aria-label="Budget" suffix="USD" defaultValue="20" onChange={onChange} />);
        const input = screen.getByRole<HTMLInputElement>("textbox", { name: "Budget" });
        expect(input.value).toBe("20");
        expect(input.parentElement?.textContent).toBe("USD");
        fireEvent.change(input, { target: { value: "25" } });
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(input.value).toBe("25");
    });

    it("passes classes to the box and to the input", () => {
        render(<SuffixField aria-label="Limit" suffix="%" className="inner" boxClassName="outer" disabled />);
        const input = screen.getByRole<HTMLInputElement>("textbox", { name: "Limit" });
        expect(input.disabled).toBe(true);
        expect(input.className).toContain("inner");
        expect(input.parentElement?.className).toContain("outer");
    });
});
