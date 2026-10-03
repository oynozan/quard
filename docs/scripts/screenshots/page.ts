import type { Cdp } from "./cdp.ts";
import { installHelpers } from "./dom.ts";
import type { Rect } from "./types.ts";

export type Page = ReturnType<typeof browserPage>;

type Evaluated<T> = { result: { value: T }; exceptionDetails?: { text: string } };

// The few page actions the screenshot jobs need
export function browserPage(cdp: Cdp) {
    const evaluate = async <T>(expression: string) => {
        const res = await cdp.send<Evaluated<T>>("Runtime.evaluate", {
            expression,
            returnByValue: true,
            awaitPromise: true,
        });
        if (res.exceptionDetails) throw new Error(res.exceptionDetails.text);
        return res.result.value;
    };
    return {
        evaluate,
        // Twice the pixels, so the shots stay sharp on high-density screens
        resize: (width: number, height: number) =>
            cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 2, mobile: false }),
        // Reduced motion makes the dashboard render its final state, with no fades in progress
        async open(url: string) {
            await cdp.send("Emulation.setEmulatedMedia", {
                features: [{ name: "prefers-reduced-motion", value: "reduce" }],
            });
            await cdp.send("Page.enable");
            await cdp.send("Page.navigate", { url });
        },
        install: () => evaluate<void>(`(${installHelpers.toString()})(window)`),
        async capture(clip?: Rect) {
            const res = await cdp.send<{ data: string }>("Page.captureScreenshot", {
                format: "webp",
                quality: 82,
                // Only a crop reaches past the window; a full-page shot has already grown the window
                captureBeyondViewport: Boolean(clip),
                ...(clip && { clip: { x: clip.x, y: clip.y, width: clip.w, height: clip.h, scale: 1 } }),
            });
            return Buffer.from(res.data, "base64");
        },
    };
}
