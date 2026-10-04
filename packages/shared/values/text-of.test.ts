import { describe, expect, it } from "vitest";
import { keysOf, keyText, textOf, underSecret } from "./text-of.ts";

describe("textOf", () => {
    it("returns text as it is", () => {
        expect(textOf("plain")).toBe("plain");
    });

    it("joins object keys, strings and numbers, one per line", () => {
        expect(textOf({ a: "x\ny", b: [2, { c: "z" }] })).toBe("a\nb\nc\nx\ny\n2\nz");
        expect(textOf(undefined)).toBe("");
    });

    it("stops at cycles", () => {
        const value: Record<string, unknown> = { key: "v" };
        value.self = value;

        expect(textOf(value)).toBe("key\nself\nv");
        expect(keysOf(value)).toEqual(["key", "self"]);
    });
});

describe("keyText", () => {
    it("leaves out values under secret-named fields, keeping their names", () => {
        const args = { to: "bob@acme.com", auth: { api_key: "Xk9mP2qL7v" }, headers: [{ cookie: "s=1234abcd" }] };

        expect(keyText(args)).toBe("to\nauth\napi_key\nheaders\ncookie\nbob@acme.com");
        expect(keyText("password=Xk9mP2qL7v")).toBe("password=Xk9mP2qL7v");
    });

    it("reads JSON text as the value it holds", () => {
        const output = JSON.stringify({ reset_token: "https://reset.example.com/r/q8Zk2mPx", to: "bob@acme.com" });

        expect(keyText(output)).toBe("reset_token\nto\nbob@acme.com");
        expect(keyText("[1]")).toBe("1");
        expect(keyText("42")).toBe("42");
        expect(keyText("null")).toBe("null");
    });
});

describe("underSecret", () => {
    it("checks every field name on the path", () => {
        expect(underSecret("auth.client_secret.value")).toBe(true);
        expect(underSecret("items[0].sessionToken")).toBe(true);
        expect(underSecret("invoice.iban")).toBe(false);
        expect(underSecret("")).toBe(false);
    });
});
