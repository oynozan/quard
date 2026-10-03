import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SearchField } from "./search-field";

function field(name = "Search") {
    return screen.getByRole("searchbox", { name });
}

function pressSlash(target: Element | Document = document, init: KeyboardEventInit = {}) {
    return fireEvent.keyDown(target, { key: "/", ...init });
}

describe("SearchField", () => {
    it("shows the / hint and names the shortcut in its title", () => {
        const { container } = render(<SearchField placeholder="Find runs" />);
        expect(field().getAttribute("title")).toBe("Search (/)");
        expect(container.querySelector("kbd")?.textContent).toBe("/");
    });

    it("focuses the field when / is pressed on the page", () => {
        render(<SearchField aria-label="Search runs" />);
        const notHandled = pressSlash();
        expect(document.activeElement).toBe(field("Search runs"));
        expect(notHandled).toBe(false);
    });

    it("ignores other keys and / with a modifier", () => {
        render(<SearchField />);
        fireEvent.keyDown(document, { key: "k" });
        pressSlash(document, { metaKey: true });
        pressSlash(document, { ctrlKey: true });
        pressSlash(document, { altKey: true });
        expect(document.activeElement).toBe(document.body);
    });

    it("leaves a / that something else already handled", () => {
        render(<SearchField />);
        const event = new KeyboardEvent("keydown", { key: "/", cancelable: true });
        event.preventDefault();
        document.dispatchEvent(event);
        expect(document.activeElement).toBe(document.body);
    });

    it("leaves a / typed into another field", () => {
        render(
            <>
                <SearchField />
                <textarea aria-label="Notes" />
            </>,
        );
        const notes = screen.getByRole("textbox", { name: "Notes" });
        notes.focus();
        pressSlash(notes);
        expect(document.activeElement).toBe(notes);
    });

    it("leaves a / typed into editable text", () => {
        render(
            <>
                <SearchField />
                <div tabIndex={0} data-testid="editor" />
            </>,
        );
        const editor = screen.getByTestId("editor");
        // jsdom does not compute isContentEditable
        Object.defineProperty(editor, "isContentEditable", { value: true });
        editor.focus();
        pressSlash(editor);
        expect(document.activeElement).toBe(editor);
    });

    it("leaves a / pressed inside an open menu", () => {
        render(
            <>
                <SearchField />
                <div role="listbox">
                    <div role="option" aria-selected="false" tabIndex={0}>
                        Alpha
                    </div>
                </div>
            </>,
        );
        const option = screen.getByRole("option");
        option.focus();
        pressSlash(option);
        expect(document.activeElement).toBe(option);
    });

    it("leaves a / while a dialog is open", () => {
        render(
            <>
                <SearchField />
                <div role="dialog" aria-label="Edit" />
            </>,
        );
        pressSlash();
        expect(document.activeElement).toBe(document.body);
    });

    it("focuses the field when focus sits on a drawing rather than an HTML element", () => {
        render(
            <>
                <SearchField />
                <svg tabIndex={0} data-testid="chart" />
            </>,
        );
        const chart = screen.getByTestId("chart");
        chart.focus();
        expect(document.activeElement).toBe(chart);
        pressSlash(chart);
        expect(document.activeElement).toBe(field());
    });

    it("has no shortcut, hint or title when turned off", () => {
        const { container } = render(<SearchField shortcut={false} boxClassName="outer" className="inner" />);
        pressSlash();
        expect(document.activeElement).toBe(document.body);
        expect(field().getAttribute("title")).toBeNull();
        expect(field().className).toContain("inner");
        expect(container.querySelector("kbd")).toBeNull();
        expect(container.querySelector("label")?.className).toContain("outer");
    });

    it("stops listening once removed", () => {
        const { unmount } = render(<SearchField />);
        unmount();
        expect(pressSlash()).toBe(true);
    });
});
