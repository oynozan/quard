import type { Badge, Mark, Rect, Target } from "./types.ts";

export type Helpers = {
    find(target: Target): Element | null;
    rect(target: Target): Rect | null;
    click(target: Target): boolean;
    mark(marks: Mark[]): string[];
};

export type HelperWindow = Window & { __shots?: Helpers };

// Installs the helpers on a page. It runs inside the browser, so it may only use its own body.
export function installHelpers(win: HelperWindow) {
    const doc = win.document;
    const visible = (el: Element) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
    };
    const find = (target: Target): Element | null => {
        let list = Array.from(doc.querySelectorAll(target.sel ?? "*"));
        const text = target.text;
        if (text) {
            list = list.filter((el) => String(el.textContent).includes(text));
            // Keep the innermost match, so a label wins over the page around it
            list = list.filter((el) => !list.some((other) => other !== el && el.contains(other)));
        }
        const el = list.filter(visible)[target.nth ?? 0];
        if (!el) return null;
        return (target.closest && el.closest(target.closest)) || el;
    };
    const rect = (target: Target): Rect | null => {
        const el = find(target);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left + win.scrollX, y: r.top + win.scrollY, w: r.width, h: r.height };
    };
    const click = (target: Target) => {
        const el = find(target) as HTMLElement | null;
        if (!el) return false;
        el.scrollIntoView({ block: "center" });
        el.click();
        return true;
    };
    const mark = (marks: Mark[]) => {
        const layer = doc.createElement("div");
        layer.style.cssText = "position:absolute;left:0;top:0;z-index:2147483647;pointer-events:none;";
        doc.body.appendChild(layer);
        const missing: string[] = [];
        for (const m of marks) {
            const r = rect(m);
            if (!r) {
                missing.push(`${m.n} ${m.text ?? m.sel}`);
                continue;
            }
            const pad = m.pad ?? 4;
            const [left, top, right, bottom] = [r.x - pad, r.y - pad, r.x + r.w + pad, r.y + r.h + pad];
            const middle = (top + bottom) / 2 - 11;
            const spots: Record<Badge, [number, number]> = {
                tl: [left - 11, top - 11],
                tr: [right - 11, top - 11],
                bl: [left - 11, bottom - 11],
                br: [right - 11, bottom - 11],
                l: [left - 28, middle],
                r: [right + 6, middle],
            };
            const [x, y] = spots[m.badge ?? "tl"];
            const box = doc.createElement("div");
            box.style.cssText = `position:absolute;left:${left}px;top:${top}px;width:${right - left}px;height:${bottom - top}px;border:2px solid #00da71;border-radius:6px;box-sizing:border-box;`;
            const chip = doc.createElement("div");
            chip.textContent = String(m.n);
            chip.style.cssText = `position:absolute;left:${x}px;top:${y}px;min-width:22px;height:22px;padding:0 6px;box-sizing:border-box;border-radius:4px;background:#00da71;color:#161616;font:700 13px/22px var(--font-ubuntu-mono),monospace;text-align:center;`;
            layer.append(box, chip);
        }
        return missing;
    };
    win.__shots = { find, rect, click, mark };
}
