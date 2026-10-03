// @vitest-environment node
import { describe, expect, it } from "vitest";
import { indexed, traceValue } from "./content-index";
import type { Label } from "../types";

const WEB: Label = { origin: "web", trust: "untrusted", sensitivity: "public" };
const USER: Label = { origin: "user", trust: "trusted", sensitivity: "internal" };

describe("indexed", () => {
    it("classifies the value when no kind is given and keeps its host and main domain", () => {
        expect(indexed("https://www.Help.Supplier-Portal.example/a/", undefined, WEB, "s1", "billing", 5)).toEqual({
            raw: "https://www.Help.Supplier-Portal.example/a/",
            norm: "https://help.supplier-portal.example/a",
            kind: "url",
            host: "help.supplier-portal.example",
            domain: "supplier-portal.example",
            label: WEB,
            stepId: "s1",
            agent: "billing",
            at: 5,
        });
    });

    it("uses the given kind and has no host for values without one", () => {
        const value = indexed("claims-desk.io", "text", USER, "s2", "support", 9);
        expect(value.kind).toBe("text");
        expect(value.norm).toBe("claims-desk.io");
        expect(value.host).toBeNull();
        expect(value.domain).toBeNull();
    });
});

describe("traceValue", () => {
    it("never traces amounts", () => {
        const index = [indexed("4,950.00 EUR", undefined, WEB, "s1", "billing", 1)];
        expect(traceValue(index, "4,950.00 EUR")).toEqual({
            kind: "amount",
            traced: false,
            generated: false,
            appearances: [],
        });
    });

    it("marks a traced value seen nowhere before as generated", () => {
        expect(traceValue([], "INV-99999")).toEqual({ kind: "id", traced: true, generated: true, appearances: [] });
    });

    it("finds the exact earlier appearance with its label and agent", () => {
        const index = [indexed("inv-20931", "id", WEB, "s1", "researcher", 3)];
        expect(traceValue(index, "INV-20931")).toEqual({
            kind: "id",
            traced: true,
            generated: false,
            appearances: [{ label: WEB, stepId: "s1", agent: "researcher", at: 3, match: "exact" }],
        });
    });

    it("matches a URL on the same host", () => {
        const index = [indexed("https://supplier-portal.example/suppliers", "url", WEB, "s1", "billing", 1)];
        const result = traceValue(index, "https://supplier-portal.example/other");
        expect(result.appearances.map((a) => a.match)).toEqual(["host"]);
    });

    it("matches a URL on the main domain of an earlier email", () => {
        const index = [indexed("ap@northwind-parts.example", "email", USER, "s1", "billing", 1)];
        const result = traceValue(index, "https://shop.northwind-parts.example");
        expect(result.appearances.map((a) => a.match)).toEqual(["domain"]);
    });

    it("traces values found inside plain text", () => {
        const index = [indexed("DE89 3704 0044 0532 0130 00", "iban", WEB, "s3", "billing", 4)];
        expect(traceValue(index, "Pay DE89 3704 0044 0532 0130 00 now")).toEqual({
            kind: "text",
            traced: true,
            generated: false,
            appearances: [{ label: WEB, stepId: "s3", agent: "billing", at: 4, match: "inside" }],
        });
    });

    it("does not trace plain text with nothing inside", () => {
        const index = [indexed("hello there", "text", WEB, "s1", "billing", 1)];
        expect(traceValue(index, "hello there")).toEqual({
            kind: "text",
            traced: false,
            generated: false,
            appearances: [],
        });
    });

    it("does not trace an ID passed as text on its own", () => {
        const index = [indexed("INV-20931", "id", WEB, "s1", "billing", 1)];
        expect(traceValue(index, "INV-20931", "text").traced).toBe(false);
    });

    it("keeps the strongest match per step", () => {
        const url = "https://supplier-portal.example/suppliers/SUP-004417";
        const index = [
            indexed("https://supplier-portal.example/home", "url", WEB, "s1", "billing", 1),
            indexed(url, "url", WEB, "s1", "billing", 1),
            indexed("https://supplier-portal.example/help", "url", WEB, "s1", "billing", 1),
        ];
        expect(traceValue(index, url).appearances).toEqual([
            { label: WEB, stepId: "s1", agent: "billing", at: 1, match: "exact" },
        ]);
    });

    it("marks an ID found inside the value as inside", () => {
        const index = [indexed("SUP-004417", "id", USER, "s2", "billing", 2)];
        const result = traceValue(index, "https://supplier-portal.example/suppliers/SUP-004417");
        expect(result.appearances).toEqual([{ label: USER, stepId: "s2", agent: "billing", at: 2, match: "inside" }]);
        expect(result.generated).toBe(false);
    });

    it("lists the first appearance first and the stronger match first at the same time", () => {
        const url = "https://supplier-portal.example/a";
        const index = [
            indexed("https://supplier-portal.example/b", "url", WEB, "late", "billing", 20),
            indexed("https://supplier-portal.example/c", "url", WEB, "host", "billing", 10),
            indexed(url, "url", USER, "exact", "support", 10),
        ];
        expect(traceValue(index, url).appearances.map((a) => [a.stepId, a.match])).toEqual([
            ["exact", "exact"],
            ["host", "host"],
            ["late", "host"],
        ]);
    });
});
