import { vi } from "vitest";

// jsdom has no clipboard, so tests install a fake writeText and remove it after
export function stubClipboard(fails = false) {
    const writeText = vi.fn(async () => {
        if (fails) throw new Error("denied");
    });
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    return writeText;
}

export function unstubClipboard() {
    Reflect.deleteProperty(navigator, "clipboard");
}
