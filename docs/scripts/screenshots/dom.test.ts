import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installHelpers, type Helpers, type HelperWindow } from "./dom";

// jsdom has no layout, so each test element carries its box as data-rect="left,top,width,height"
function box(this: Element) {
    const [left = 0, top = 0, width = 0, height = 0] = (this.getAttribute("data-rect") ?? "").split(",").map(Number);
    return { left, top, width, height } as DOMRect;
}

let shots: Helpers;

beforeEach(() => {
    document.body.innerHTML = `
        <section aria-label="Runs" data-rect="0,0,400,300">
            <h2 data-rect="10,10,100,20">Runs</h2>
            <button data-rect="10,40,80,30"><span data-rect="12,42,40,20">Revoke</span></button>
            <button data-rect="10,80,80,30">Revoke</button>
            <p>hidden text</p>
        </section>`;
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(box);
    HTMLElement.prototype.scrollIntoView = vi.fn();
    installHelpers(window as HelperWindow);
    shots = (window as HelperWindow).__shots as Helpers;
});

afterEach(() => vi.restoreAllMocks());

describe("find", () => {
    it("finds by selector, by text, and by position", () => {
        expect(shots.find({ sel: "h2" })?.textContent).toBe("Runs");
        expect(shots.find({ text: "Revoke" })?.tagName).toBe("SPAN");
        expect(shots.find({ sel: "button", text: "Revoke", nth: 1 })?.getAttribute("data-rect")).toBe("10,80,80,30");
    });

    it("widens to an ancestor, or keeps the element when none matches", () => {
        expect(shots.find({ text: "Revoke", closest: "section" })?.tagName).toBe("SECTION");
        expect(shots.find({ sel: "h2", closest: "table" })?.tagName).toBe("H2");
    });

    it("skips hidden elements and reports nothing found", () => {
        expect(shots.find({ text: "hidden text" })).toBeNull();
    });
});

describe("rect and click", () => {
    it("measures from the top of the page", () => {
        Object.defineProperty(window, "scrollY", { value: 100, configurable: true });
        expect(shots.rect({ sel: "h2" })).toEqual({ x: 10, y: 110, w: 100, h: 20 });
        expect(shots.rect({ sel: "table" })).toBeNull();
        Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
    });

    it("clicks the element it finds", () => {
        const onClick = vi.fn();
        document.querySelector("h2")?.addEventListener("click", onClick);
        expect(shots.click({ sel: "h2" })).toBe(true);
        expect(onClick).toHaveBeenCalled();
        expect(shots.click({ sel: "table" })).toBe(false);
    });
});

describe("mark", () => {
    const chips = () => Array.from(document.querySelectorAll("body > div > div:nth-child(even)")) as HTMLElement[];
    const boxes = () => Array.from(document.querySelectorAll("body > div > div:nth-child(odd)")) as HTMLElement[];

    it("draws a numbered box around each element", () => {
        expect(shots.mark([{ n: 1, sel: "h2" }])).toEqual([]);
        const [first] = boxes();
        expect(first?.style.left).toBe("6px");
        expect(first?.style.width).toBe("108px");
        expect(chips()[0]?.textContent).toBe("1");
        expect(chips()[0]?.style.left).toBe("-5px");
    });

    it("places the number on any side, with any padding", () => {
        const sides = ["tl", "tr", "bl", "br", "l", "r"] as const;
        shots.mark(sides.map((badge, i) => ({ n: i + 1, sel: "h2", pad: 0, badge })));
        expect(chips().map((chip) => [chip.style.left, chip.style.top])).toEqual([
            ["-1px", "-1px"],
            ["99px", "-1px"],
            ["-1px", "19px"],
            ["99px", "19px"],
            ["-18px", "9px"],
            ["116px", "9px"],
        ]);
    });

    it("lists the marks it could not place", () => {
        expect(
            shots.mark([
                { n: 2, sel: "table" },
                { n: 3, text: "Nowhere" },
            ]),
        ).toEqual(["2 table", "3 Nowhere"]);
    });
});
