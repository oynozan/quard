import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Checkbox, CheckRow, TableCheckbox } from "./checkbox";

describe("Checkbox", () => {
    it("toggles and reports the new state", () => {
        const onCheckedChange = vi.fn();
        render(<Checkbox aria-label="Notify me" onCheckedChange={onCheckedChange} />);
        const box = screen.getByRole("checkbox", { name: "Notify me" });
        expect(box.getAttribute("aria-checked")).toBe("false");
        fireEvent.click(box);
        expect(box.getAttribute("aria-checked")).toBe("true");
        expect(onCheckedChange.mock.calls[0][0]).toBe(true);
    });

    it("shows a mixed state", () => {
        render(<Checkbox aria-label="All runs" indeterminate />);
        expect(screen.getByRole("checkbox", { name: "All runs" }).getAttribute("aria-checked")).toBe("mixed");
    });
});

describe("CheckRow", () => {
    it("labels its checkbox, so clicking the words ticks it", () => {
        render(<CheckRow defaultChecked={false}>Email me a weekly summary</CheckRow>);
        const box = screen.getByRole("checkbox", { name: "Email me a weekly summary" });
        fireEvent.click(screen.getByText("Email me a weekly summary"));
        expect(box.getAttribute("aria-checked")).toBe("true");
    });

    it("stays unchanged while disabled", () => {
        render(<CheckRow disabled>Email me</CheckRow>);
        const box = screen.getByRole("checkbox", { name: "Email me" });
        expect(box.getAttribute("aria-disabled")).toBe("true");
        fireEvent.click(box);
        expect(box.getAttribute("aria-checked")).toBe("false");
    });
});

describe("TableCheckbox", () => {
    it("selects a row from its hit area", () => {
        const onCheckedChange = vi.fn();
        render(<TableCheckbox aria-label="Select run_1" defaultChecked onCheckedChange={onCheckedChange} />);
        const box = screen.getByRole("checkbox", { name: "Select run_1" });
        expect(box.getAttribute("aria-checked")).toBe("true");
        fireEvent.click(box);
        expect(onCheckedChange.mock.calls[0][0]).toBe(false);
    });
});
