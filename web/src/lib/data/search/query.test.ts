// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { RUN_A, runA, supportRuns } from "../../../../test/data-values-search/catalog";
import { keyedHash } from "../values/hash";
import { searchRuns } from "./query";
import type { SearchResult } from "./types";

const mocks = vi.hoisted(() => ({ catalogRuns: vi.fn() }));
vi.mock("@/lib/data/runs/catalog", () => ({ catalogRuns: mocks.catalogRuns }));
mocks.catalogRuns.mockReturnValue([runA(), ...supportRuns(201)]);

const found = (result: SearchResult) => result.matches.map((m) => [m.stepId, m.field, m.match]);

describe("searchRuns with too little to search", () => {
    it("finds nothing for an empty query", async () => {
        expect(await searchRuns("   ")).toEqual({
            query: "",
            kind: "text",
            byHash: false,
            hash: null,
            shown: "",
            matches: [],
            total: 0,
            runs: 0,
            truncated: false,
        });
    });

    it("finds nothing for plain text under 3 characters, even when values contain it", async () => {
        const result = await searchRuns(" in ");
        expect(result.query).toBe("in");
        expect(result.kind).toBe("text");
        expect(result.shown).toBe("in");
        expect(result.matches).toEqual([]);
        expect(result.total).toBe(0);
    });

    it("searches plain text from 3 characters", async () => {
        expect(found(await searchRuns("inv"))).toEqual([
            ["s4", "brief", "text"],
            ["s3", "note", "text"],
            ["s2", "output", "text"],
        ]);
    });
});

describe("searchRuns by name", () => {
    it("finds an agent by name in any case", async () => {
        const result = await searchRuns("  Billing ");
        expect(result.kind).toBe("agent");
        expect(result.shown).toBe("Billing");
        expect(result.byHash).toBe(false);
        expect(result.hash).toBeNull();
        expect(result.matches).toEqual([
            {
                runId: RUN_A,
                stepId: "s1",
                agent: "billing",
                tool: "",
                field: "agent",
                value: "billing",
                kind: "agent",
                label: runA().detail.steps[0].context,
                at: 10,
                byHash: false,
                match: "name",
            },
        ]);
    });

    it("finds a tool by name", async () => {
        const result = await searchRuns("fetch_page");
        expect(result.kind).toBe("tool");
        expect(found(result)).toEqual([["s2", "tool", "name"]]);
    });

    it("stops at 200 matches, newest first, and counts the rest", async () => {
        const result = await searchRuns("support");
        expect(result.matches).toHaveLength(200);
        expect(result.total).toBe(201);
        expect(result.runs).toBe(201);
        expect(result.truncated).toBe(true);
        expect(result.matches[0].at).toBe(1200);
        expect(result.matches[199].at).toBe(1001);
    });
});

describe("searchRuns for sensitive values", () => {
    it("matches an IBAN by keyed hash, once per place, and masks it", async () => {
        const result = await searchRuns("de89370400440532013000");
        expect(result.kind).toBe("iban");
        expect(result.byHash).toBe(true);
        expect(result.hash).toBe(keyedHash("DE89370400440532013000").slice(0, 12));
        expect(result.shown).toBe("DE89…3000");
        expect(found(result)).toEqual([
            ["s6", "memory", "exact"],
            ["s3", "note", "inside"],
        ]);
        expect(result.matches.every((m) => m.byHash && m.value === "DE89…3000")).toBe(true);
        expect(result.total).toBe(2);
        expect(result.runs).toBe(1);
        expect(result.truncated).toBe(false);
    });

    it("matches an email in any case", async () => {
        const result = await searchRuns("Remit@Northwind-Payments.example");
        expect(result.shown).toBe("r…@northwind-payments.example");
        expect(found(result)).toEqual([["s5", "message", "exact"]]);
    });

    it("finds nothing for an email no run saw", async () => {
        const result = await searchRuns("nobody@example.com");
        expect(result.byHash).toBe(true);
        expect(result.matches).toEqual([]);
        expect(result.runs).toBe(0);
    });
});

describe("searchRuns for URLs and domains", () => {
    it("matches the same URL after normalizing it", async () => {
        const result = await searchRuns("https://supplier-portal.example/suppliers/SUP-004417/");
        expect(found(result)).toEqual([["s2", "output", "exact"]]);
        expect(result.matches[0].byHash).toBe(false);
    });

    it("matches another URL on the same host", async () => {
        expect(found(await searchRuns("https://supplier-portal.example/other"))).toEqual([["s2", "output", "host"]]);
    });

    it("matches a domain against hosts under it", async () => {
        const result = await searchRuns("nwparts-secure.example");
        expect(result.kind).toBe("domain");
        expect(found(result)).toEqual([["s3", "url", "domain"]]);
    });

    it("matches a domain exactly, and a parent domain by main domain", async () => {
        expect(found(await searchRuns("mail.acme.co.uk"))).toEqual([["s1", "input", "exact"]]);
        expect(found(await searchRuns("acme.co.uk"))).toEqual([["s1", "input", "domain"]]);
    });

    it("finds nothing for a URL without a host", async () => {
        const result = await searchRuns("http://:8080");
        expect(result.kind).toBe("url");
        expect(result.total).toBe(0);
    });
});

describe("searchRuns for IDs and text", () => {
    it("matches an ID on its own and inside a longer value", async () => {
        const result = await searchRuns("INV-20931");
        expect(result.kind).toBe("id");
        expect(found(result)).toEqual([
            ["s4", "brief", "exact"],
            ["s3", "note", "inside"],
        ]);
    });

    it("matches plain text inside values in any case", async () => {
        const result = await searchRuns("INVOICE run");
        expect(result.kind).toBe("text");
        expect(found(result)).toEqual([["s2", "output", "text"]]);
    });

    it("does not match plain text against agent and tool names", async () => {
        const result = await searchRuns("fetch_pa");
        expect(result.kind).toBe("text");
        expect(result.matches).toEqual([]);
    });
});
