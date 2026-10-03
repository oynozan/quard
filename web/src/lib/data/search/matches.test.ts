// @vitest-environment node
import type { CallMatchRow, ContentMatchRow } from "@quard/db";
import { describe, expect, it } from "vitest";
import { KIND_OF, nameMatches, valueMatches } from "./matches";

const AT = new Date(Date.UTC(2026, 9, 3, 12, 0, 3));
const KEYS = ["url:https://pay.example.com/i/1", "host:pay.example.com", "domain:example.com"];

function call(extra: Partial<CallMatchRow> = {}): CallMatchRow {
    return {
        source: "call",
        runId: "r1",
        stepId: "s2",
        agent: "billing",
        at: AT,
        matched: [KEYS[0]],
        stepName: "sendEmail",
        arguments: { to: "u…@example.com", body: "See https://pay.example.com/i/1 today" },
        label: null,
        ...extra,
    };
}

function content(extra: Partial<ContentMatchRow> = {}): ContentMatchRow {
    return {
        source: "content",
        runId: "r1",
        stepId: "s1",
        agent: "billing",
        at: AT,
        matched: [KEYS[1]],
        stepKind: "tool_call",
        stepName: "fetchPage",
        label: { origin: "web:pay.example.com", trust: "untrusted", sensitivity: "public" },
        ...extra,
    };
}

describe("valueMatches", () => {
    it("names the argument that holds the value, and says when it holds more", () => {
        expect(valueMatches([call()], KEYS)).toEqual([
            {
                runId: "r1",
                stepId: "s2",
                agent: "billing",
                tool: "sendEmail",
                field: "body",
                value: "https://pay.example.com/i/1",
                label: null,
                at: AT.getTime(),
                match: "inside",
            },
        ]);
    });

    it("falls back to the arguments when no single argument shows the value", () => {
        const [match] = valueMatches([call({ arguments: { body: "…" } })], KEYS);

        expect(match).toMatchObject({ field: "arguments", match: "exact" });
    });

    it("matches a call by host or main domain when it holds only those", () => {
        const matches = valueMatches([call({ matched: [KEYS[1]] }), call({ matched: [KEYS[2]] })], KEYS);

        expect(matches.map(({ field, value, match }) => ({ field, value, match }))).toEqual([
            { field: "body", value: "pay.example.com", match: "host" },
            { field: "to", value: "example.com", match: "domain" },
        ]);
    });

    it("calls content a tool returned its output", () => {
        const [match] = valueMatches([content()], KEYS);

        expect(match).toMatchObject({ tool: "fetchPage", field: "output", value: "pay.example.com", match: "host" });
        expect(match.label).toEqual({ origin: "web:pay.example.com", trust: "untrusted", sensitivity: "public" });
    });
});

describe("nameMatches", () => {
    it("shows an agent at its first step and a tool where it was called", () => {
        const row = {
            runId: "r1",
            stepId: "s1",
            agent: "billing",
            kind: "tool_call" as const,
            name: "payInvoice",
            at: AT,
        };

        expect(nameMatches([row], "agent")[0]).toMatchObject({ tool: "", field: "agent", value: "billing" });
        expect(nameMatches([row], "tool")[0]).toMatchObject({ tool: "payInvoice", field: "tool", value: "payInvoice" });
    });
});

describe("KIND_OF", () => {
    it("searches a host as a domain", () => {
        expect(KIND_OF.host).toBe("domain");
        expect(KIND_OF.iban).toBe("iban");
    });
});
