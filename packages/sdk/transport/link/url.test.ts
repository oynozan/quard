import { describe, expect, it } from "vitest";
import { controlSocketUrl } from "./url.ts";

describe("controlSocketUrl", () => {
    it.each([
        ["http://localhost:4200", "ws://localhost:4200/v1/connect"],
        ["https://control.acme.com/", "wss://control.acme.com/v1/connect"],
        ["wss://acme.com/quard/control//", "wss://acme.com/quard/control/v1/connect"],
        ["ws://10.0.0.5:4200/?debug=1#top", "ws://10.0.0.5:4200/v1/connect"],
    ])("turns %s into %s", (url, expected) => {
        expect(controlSocketUrl(url)).toBe(expected);
    });

    it.each(["localhost:4200", "ftp://control.acme.com", "not a url"])("refuses %s", (url) => {
        expect(() => controlSocketUrl(url)).toThrow("controlUrl must be an http, https, ws or wss URL");
    });
});
