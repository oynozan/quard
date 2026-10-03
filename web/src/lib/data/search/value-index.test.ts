// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { RUN_A, USER, WEB, runA } from "../../../../test/data-values-search/catalog";
import { keyedHash } from "../values/hash";
import { classifyQuery, isSensitive, valueIndex } from "./value-index";
import type { SearchKind } from "./types";

const mocks = vi.hoisted(() => ({ catalogRuns: vi.fn() }));
vi.mock("@/lib/data/runs/catalog", () => ({ catalogRuns: mocks.catalogRuns }));
mocks.catalogRuns.mockReturnValue([runA()]);

describe("isSensitive", () => {
    it("is true for IBANs, emails and cards only", () => {
        const kinds: SearchKind[] = ["iban", "email", "card", "url", "domain", "id", "text", "agent"];
        expect(kinds.filter(isSensitive)).toEqual(["iban", "email", "card"]);
    });
});

describe("classifyQuery", () => {
    const agents = ["billing", "summarize"];
    const tools = ["fetch_page", "summarize"];

    it("knows agent names in any case and with spaces around", () => {
        expect(classifyQuery("  Billing ", agents, tools)).toBe("agent");
    });

    it("knows tool names", () => {
        expect(classifyQuery("FETCH_PAGE", agents, tools)).toBe("tool");
    });

    it("prefers the agent when a name is both", () => {
        expect(classifyQuery("summarize", agents, tools)).toBe("agent");
    });

    it("falls back to the value kind", () => {
        expect(classifyQuery("claims-desk.io", agents, tools)).toBe("domain");
        expect(classifyQuery("INV-20931", agents, tools)).toBe("id");
    });
});

describe("valueIndex", () => {
    it("lists read values, call values, values inside calls, then names", () => {
        const masked = "DE89…3000";
        expect(valueIndex().map((e) => [e.stepId, e.field, e.kind, e.shown, e.inside])).toEqual([
            ["s1", "input", "domain", "mail.acme.co.uk", false],
            ["s2", "output", "url", "https://www.supplier-portal.example/suppliers/SUP-004417", false],
            ["s2", "output", "text", "Quarterly invoice run notes", false],
            ["s4", "brief", "id", "INV-20931", false],
            ["s5", "message", "email", "r…@northwind-payments.example", false],
            ["s6", "memory", "iban", masked, false],
            ["s6", "memory", "iban", masked, false],
            ["s3", "url", "url", "https://pay.nwparts-secure.example/x", false],
            ["s3", "note", "iban", masked, true],
            ["s3", "note", "id", "INV-20931", true],
            ["s1", "agent", "agent", "billing", false],
            ["s2", "tool", "tool", "fetch_page", false],
            ["s4", "agent", "agent", "researcher", false],
        ]);
    });

    it("keeps the run, agent, tool, label and time of a value", () => {
        expect(valueIndex()[3]).toMatchObject({
            runId: RUN_A,
            agent: "researcher",
            tool: "researcher",
            label: WEB,
            at: 41,
        });
    });

    it("keeps clear text, host and main domain for values that are not sensitive", () => {
        expect(valueIndex()[0]).toMatchObject({
            hash: null,
            clear: "mail.acme.co.uk",
            host: "mail.acme.co.uk",
            domain: "acme.co.uk",
        });
        expect(valueIndex()[2]).toMatchObject({ clear: "quarterly invoice run notes", host: null, domain: null });
    });

    it("keeps only a keyed hash and a mask for sensitive values", () => {
        expect(valueIndex()[4]).toMatchObject({
            hash: keyedHash("remit@northwind-payments.example"),
            clear: null,
            host: "northwind-payments.example",
        });
        expect(valueIndex()[8]).toMatchObject({ hash: keyedHash("DE89370400440532013000"), clear: null });
    });

    it("gives names a lowercase clear text, the step label and the step time", () => {
        expect(valueIndex()[10]).toMatchObject({ tool: "", clear: "billing", label: USER, at: 10, hash: null });
        expect(valueIndex()[11]).toMatchObject({ tool: "fetch_page", agent: "billing", at: 20 });
    });

    it("builds the index once and reuses it", async () => {
        vi.resetModules();
        mocks.catalogRuns.mockClear();
        const fresh = await import("./value-index");
        const first = fresh.valueIndex();
        expect(fresh.valueIndex()).toBe(first);
        expect(first).toHaveLength(13);
        expect(mocks.catalogRuns).toHaveBeenCalledTimes(1);
    });
});
