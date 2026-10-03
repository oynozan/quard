import type { RunLabel } from "@quard/db";
import { describe, expect, it } from "vitest";
import { argsOf, flatten, parseKey, valueLabelOf } from "./values";

const label = (keys: string[], origin = "web:x.com"): RunLabel => ({
    contentId: "c1",
    stepId: "1".repeat(16),
    agent: "billing",
    origin,
    trust: "untrusted",
    sensitivity: "public",
    flags: [],
    keys,
    at: new Date(1000),
});

describe("parseKey", () => {
    it("splits the mask from the hash of sensitive keys only", () => {
        expect(parseKey("iban:GB33…5555#abc")).toEqual({
            kind: "iban",
            shown: "GB33…5555",
            full: "iban:GB33…5555#abc",
        });
        expect(parseKey("email:j…@acme.com")).toMatchObject({ shown: "j…@acme.com" });
        expect(parseKey("url:https://x.com/a#top")).toMatchObject({ kind: "url", shown: "https://x.com/a#top" });
    });
});

describe("flatten", () => {
    it("lists leaf values by path", () => {
        expect(flatten({ a: 1, b: { c: ["x", null] }, d: undefined })).toEqual([
            { path: "a", value: "1" },
            { path: "b.c[0]", value: "x" },
            { path: "b.c[1]", value: "null" },
        ]);
        expect(flatten("plain")).toEqual([{ path: "input", value: "plain" }]);
        expect(flatten(undefined)).toEqual([]);
    });
});

describe("valueLabelOf", () => {
    const keys = ["url:https://x.com/inv/1", "host:x.com", "domain:x.com", "id:INV-12345"].map(parseKey);

    it("matches the strongest key, and says how each earlier appearance matched", () => {
        const before = [
            label(["url:https://x.com/inv/1"]),
            label(["host:x.com"], "user"),
            label(["domain:x.com"], "mail"),
        ];
        const traced = valueLabelOf("https://x.com/inv/1", keys, before, false);

        expect(traced.kind).toBe("url");
        expect(traced.appearances.map((appearance) => [appearance.label.origin, appearance.match])).toEqual([
            ["web:x.com", "exact"],
            ["user", "host"],
            ["mail", "domain"],
        ]);
    });

    it("finds a value inside a longer one, and calls an unseen value model-generated", () => {
        const inside = valueLabelOf("ref INV-12345 attached", keys, [label(["id:INV-12345"])], false);
        expect(inside).toMatchObject({ kind: "id", generated: false, appearances: [{ match: "inside" }] });

        expect(valueLabelOf("INV-12345", keys, [], false)).toMatchObject({ traced: true, generated: true });
        expect(valueLabelOf("INV-12345", keys, [label(["id:INV-12345"])], true).generated).toBe(true);
    });

    it("treats unknown key kinds as ids and untraced values by shape", () => {
        expect(valueLabelOf("4111…1111", [parseKey("card:4111…1111")], [], false).kind).toBe("id");
        expect(valueLabelOf("4111…1111", [parseKey("card:4111…1111"), parseKey("id:4111…1111")], [], false).kind).toBe(
            "id",
        );
        expect(valueLabelOf("12.5", [], [], false)).toEqual({
            kind: "amount",
            traced: false,
            generated: false,
            appearances: [],
        });
        expect(valueLabelOf("hello", [parseKey("id:")], [], false).kind).toBe("text");
    });
});

describe("argsOf", () => {
    it("lists masked arguments with their value labels", () => {
        const args = argsOf({ to: "j…@acme.com" }, [`email:j…@acme.com#${"0".repeat(32)}`], [], new Set(["to"]));

        expect(args).toEqual([
            {
                name: "to",
                value: "j…@acme.com",
                masked: true,
                valueLabel: { kind: "email", traced: true, generated: true, appearances: [] },
            },
        ]);
    });
});
