import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PortalContainerProvider } from "./portal-container";
import { Select, type SelectOption } from "./select";

const OPTIONS: SelectOption[] = [
    { value: "day", label: "Last 24 hours" },
    { value: "week", label: "Last 7 days" },
    { value: "year", label: "Last year", disabled: true },
];

function trigger() {
    return screen.getByRole("combobox", { name: "Range" });
}

function open() {
    fireEvent.click(trigger());
}

// A real mouse click on an item starts with a pointer down on it
function pick(name: string) {
    const option = screen.getByRole("option", { name });
    fireEvent.pointerDown(option, { pointerType: "mouse" });
    fireEvent.click(option);
}

describe("Select", () => {
    it("shows the placeholder until something is picked", () => {
        render(<Select aria-label="Range" options={OPTIONS} placeholder="Pick a range" />);
        expect(trigger().textContent).toBe("Pick a range");
        expect(trigger().getAttribute("aria-expanded")).toBe("false");
        expect(trigger().className).toContain("min-h-[42px]");
    });

    it("lists the options and reports the one picked", () => {
        const onValueChange = vi.fn();
        render(<Select aria-label="Range" options={OPTIONS} defaultValue="day" onValueChange={onValueChange} />);
        expect(trigger().textContent).toBe("Last 24 hours");
        open();
        const options = screen.getAllByRole("option");
        expect(options.map((o) => o.textContent)).toEqual(["Last 24 hours", "Last 7 days", "Last year"]);
        expect(options[0].getAttribute("aria-selected")).toBe("true");
        expect(options[2].getAttribute("aria-disabled")).toBe("true");
        pick("Last 7 days");
        expect(onValueChange.mock.calls[0][0]).toBe("week");
        expect(trigger().textContent).toBe("Last 7 days");
        expect(screen.queryByRole("listbox")).toBeNull();
    });

    it("submits the pick under its name even when no one listens for changes", () => {
        render(<Select aria-label="Range" options={OPTIONS} name="range" id="range" />);
        open();
        pick("Last 7 days");
        expect(trigger().textContent).toBe("Last 7 days");
        expect(trigger().id).toBe("range");
        const input = document.querySelector<HTMLInputElement>('input[name="range"]');
        expect(input?.value).toBe("week");
    });

    it("does not report a choice that carries no value", () => {
        const onValueChange = vi.fn();
        // Options built from loose data can hold a null value at run time
        const loose = [{ value: null, label: "Any time" }] as unknown as SelectOption[];
        render(<Select aria-label="Range" options={loose} defaultValue="day" onValueChange={onValueChange} />);
        open();
        pick("Any time");
        expect(trigger().textContent).toBe("Any time");
        expect(onValueChange).not.toHaveBeenCalled();
    });

    it("cannot open while disabled", () => {
        render(<Select aria-label="Range" options={OPTIONS} disabled size="compact" />);
        expect(trigger().className).toContain("max-w-[160px]");
        open();
        expect(screen.queryAllByRole("option")).toHaveLength(0);
    });

    it("opens its menu inside the drawer that holds it", () => {
        const sheet = document.createElement("div");
        document.body.append(sheet);
        render(
            <PortalContainerProvider value={sheet}>
                <Select aria-label="Range" options={OPTIONS} value="week" />
            </PortalContainerProvider>,
        );
        open();
        expect(sheet.contains(screen.getByRole("listbox"))).toBe(true);
        sheet.remove();
    });
});
