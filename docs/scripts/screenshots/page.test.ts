// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Cdp } from "./cdp";
import { browserPage } from "./page";

// Records each request and answers with a canned result
function fakeCdp(answer: (method: string) => unknown = () => ({})) {
    const calls: [string, object | undefined][] = [];
    const cdp: Cdp = {
        send: async <T>(method: string, params?: object) => {
            calls.push([method, params]);
            return answer(method) as T;
        },
        close: () => {},
    };
    return { cdp, calls };
}

describe("browserPage", () => {
    it("sizes the page at twice the pixels", async () => {
        const { cdp, calls } = fakeCdp();
        await browserPage(cdp).resize(1440, 900);
        expect(calls).toEqual([
            ["Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false }],
        ]);
    });

    it("opens a page with reduced motion", async () => {
        const { cdp, calls } = fakeCdp();
        await browserPage(cdp).open("http://localhost:3000/runs");
        expect(calls.map(([method]) => method)).toEqual(["Emulation.setEmulatedMedia", "Page.enable", "Page.navigate"]);
        expect(calls[2]?.[1]).toEqual({ url: "http://localhost:3000/runs" });
    });

    it("returns values from the page, and throws its errors", async () => {
        const { cdp } = fakeCdp(() => ({ result: { value: 42 } }));
        await expect(browserPage(cdp).evaluate("6 * 7")).resolves.toBe(42);
        const failing = fakeCdp(() => ({ result: {}, exceptionDetails: { text: "Uncaught" } }));
        await expect(browserPage(failing.cdp).evaluate("oops")).rejects.toThrow("Uncaught");
    });

    it("installs the helpers by sending their source", async () => {
        const { cdp, calls } = fakeCdp(() => ({ result: {} }));
        await browserPage(cdp).install();
        const [, params] = calls[0] as [string, { expression: string }];
        expect(params.expression).toMatch(/^\(function installHelpers/);
        expect(params.expression).toMatch(/\)\(window\)$/);
    });

    it("captures the whole page or a clip of it", async () => {
        const { cdp, calls } = fakeCdp(() => ({ data: Buffer.from("img").toString("base64") }));
        const page = browserPage(cdp);
        await expect(page.capture()).resolves.toEqual(Buffer.from("img"));
        await page.capture({ x: 1, y: 2, w: 3, h: 4 });
        expect(calls[0]?.[1]).not.toHaveProperty("clip");
        expect(calls[0]?.[1]).toHaveProperty("captureBeyondViewport", false);
        expect(calls[1]?.[1]).toHaveProperty("clip", { x: 1, y: 2, width: 3, height: 4, scale: 1 });
        expect(calls[1]?.[1]).toHaveProperty("captureBeyondViewport", true);
    });
});
