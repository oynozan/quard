// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { searchRuns } from "@/lib/data/search";
import { found, setUpSearchDb } from "../../../../test/search/db";
import {
    DOCS_RUN,
    docsRun,
    EMAIL,
    EMAIL_MASK,
    FETCH,
    FILE,
    FILE_LABEL,
    IBAN,
    IBAN_MASK,
    IBAN_TYPED,
    INVOICE_ID,
    INVOICE_RUN,
    INVOICE_SHOWN,
    invoiceRun,
    LATER,
    MAIN_DOMAIN,
    manyReads,
    PATH,
    PAY,
    PAY_HOST,
    PAY_URL,
    READ,
    T0,
    USER,
    WEB,
} from "../../../../test/search/events";

vi.mock("@/lib/auth/session", () => ({
    requireSession: async () => ({ sub: "did:privy:1", email: null, github: null, exp: 0 }),
}));
vi.mock("next/server", () => ({ connection: vi.fn(async () => {}) }));

const project = setUpSearchDb();
const at = (seconds: number) => T0 + seconds * 1000;

describe("searchRuns by value", () => {
    it("finds an IBAN by its keyed hash, where the run read it and where it sent it", async () => {
        await project(...invoiceRun(), ...docsRun());

        expect(await found(IBAN_TYPED)).toEqual({
            query: IBAN_TYPED,
            kind: "iban",
            byHash: true,
            shown: IBAN_MASK,
            matches: [
                {
                    runId: INVOICE_RUN,
                    stepId: PAY,
                    agent: "billing",
                    tool: "payInvoice",
                    field: "iban",
                    value: IBAN_MASK,
                    label: WEB,
                    at: at(3),
                    match: "exact",
                },
                {
                    runId: INVOICE_RUN,
                    stepId: READ,
                    agent: "billing",
                    tool: "gpt-5.4-mini",
                    field: "input",
                    value: IBAN_MASK,
                    label: WEB,
                    at: at(1),
                    match: "exact",
                },
            ],
            runRows: [
                expect.objectContaining({ id: INVOICE_RUN, startedAt: at(0), durationMs: 4000, tools: ["payInvoice"] }),
            ],
            total: 2,
            runs: 1,
            truncated: false,
        });
    });

    it("finds a URL itself, its host and its main domain, newest first, with the runs they are in", async () => {
        await project(...invoiceRun(), ...docsRun());

        const result = await found(PAY_URL);

        expect(result).toMatchObject({ kind: "url", byHash: false, shown: PAY_URL, total: 4, runs: 2 });
        expect(result.matches).toEqual([
            {
                runId: DOCS_RUN,
                stepId: LATER,
                agent: "researcher",
                tool: "",
                field: "content",
                value: PAY_HOST,
                label: USER,
                at: at(15),
                match: "host",
            },
            {
                runId: DOCS_RUN,
                stepId: FILE,
                agent: "researcher",
                tool: "readFile",
                field: "output",
                value: MAIN_DOMAIN,
                label: FILE_LABEL,
                at: at(14),
                match: "domain",
            },
            {
                runId: DOCS_RUN,
                stepId: FETCH,
                agent: "researcher",
                tool: "fetchPage",
                field: "url",
                value: MAIN_DOMAIN,
                label: null,
                at: at(11),
                match: "domain",
            },
            {
                runId: INVOICE_RUN,
                stepId: READ,
                agent: "billing",
                tool: "gpt-5.4-mini",
                field: "input",
                value: PAY_URL,
                label: WEB,
                at: at(1),
                match: "exact",
            },
        ]);
        expect(result.runRows.map(({ id, status }) => ({ id, status }))).toEqual([
            { id: DOCS_RUN, status: "blocked" },
            { id: INVOICE_RUN, status: "completed" },
        ]);
    });

    it("finds an ID in any case, inside a longer argument", async () => {
        await project(...invoiceRun());

        const result = await found(INVOICE_ID);

        expect(result).toMatchObject({ kind: "id", shown: INVOICE_SHOWN, total: 2, runs: 1 });
        expect(result.matches.map(({ stepId, field, value, match }) => ({ stepId, field, value, match }))).toEqual([
            { stepId: PAY, field: "memo", value: INVOICE_SHOWN, match: "inside" },
            { stepId: READ, field: "input", value: INVOICE_SHOWN, match: "exact" },
        ]);
    });

    it("finds nothing for a value no run holds, and fetches no runs", async () => {
        await project(...invoiceRun());

        expect(await found(EMAIL)).toEqual({
            query: EMAIL,
            kind: "email",
            byHash: true,
            shown: EMAIL_MASK,
            matches: [],
            runRows: [],
            total: 0,
            runs: 0,
            truncated: false,
        });
    });

    it("lists the newest 50 matches and says there are more", async () => {
        await project(...manyReads(51));

        const result = await found(PATH);

        expect(result).toMatchObject({ kind: "path", total: 51, runs: 1, truncated: true });
        expect(result.matches).toHaveLength(50);
        expect(result.matches[0].at).toBe(at(51));
        expect(result.runRows.map((row) => row.id)).toEqual([DOCS_RUN]);
    });

    it("searches only the current project", async () => {
        await project(...invoiceRun());
        await project(...docsRun());

        expect(await searchRuns("billing")).toEqual({ state: "nothing" });
        expect((await found(IBAN)).total).toBe(0);
    });
});
