// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { guardOf, stepOf } from "../../../test/data-guards-incidents/steps";
import { latestDecisions } from "./events";
import { MINUTE, NOW } from "./rng";
import { catalogRuns, type CatalogRun } from "./runs/catalog";
import type { Step } from "./runs/types";

// The catalog is the log's data source; edge cases swap in one small run.
vi.mock("./runs/catalog", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./runs/catalog")>();
    return { ...actual, catalogRuns: vi.fn(actual.catalogRuns) };
});

const realCatalog = await vi.importActual<typeof import("./runs/catalog")>("./runs/catalog");

afterEach(() => {
    vi.mocked(catalogRuns).mockImplementation(realCatalog.catalogRuns);
});

const RUN_ID = "4bf92f3577b34da6a3ce929d0e0e4736";

// A real run with its steps swapped for these, ending at the given time.
function useRun(steps: Step[], endedAt = NOW) {
    const base = realCatalog.catalogRuns()[0];
    const summary = { ...base.detail.summary, id: RUN_ID, startedAt: endedAt - MINUTE, durationMs: MINUTE };
    const run: CatalogRun = { ...base, detail: { ...base.detail, summary, steps } };
    vi.mocked(catalogRuns).mockReturnValue([run]);
}

const CALL = "aaaaaaaaaaaaaaaa";

describe("latestDecisions with the sample runs", () => {
    it("gives the last 12 decisions of the last 10 minutes, oldest first", () => {
        const events = latestDecisions();
        expect(events).toHaveLength(12);
        expect(events.every((event, i) => i === 0 || event.at >= events[i - 1].at)).toBe(true);
        expect(events.every((event) => event.at >= NOW - 10 * MINUTE)).toBe(true);
    });

    it("leaves out counter checks that let the call through", () => {
        const events = latestDecisions();
        expect(events.some((event) => event.guard === "limit" && event.outcome === "allow")).toBe(false);
    });

    it("writes a short line per kind of guard", () => {
        const details = latestDecisions().map((event) => [event.tool, event.outcome, event.detail]);
        expect(details).toContainEqual(["pay_invoice", "ask", "4,950.00 EUR to DE89…3000"]);
        expect(details).toContainEqual(["read_inbox", "strip", "claims-desk.io · instructions aimed at an AI"]);
        expect(details).toContainEqual(["crm_lookup", "pass", "crm.acme.internal"]);
        expect(details).toContainEqual([
            "send_email",
            "block",
            "c…@claims-desk.io · Internal data headed to an address that first appeared in outside email (claims-desk.io)",
        ]);
    });

    it("shows an observe-mode block as allowed, with what it would have done", () => {
        const event = latestDecisions().find((item) => item.detail.startsWith("would block"));
        expect(event).toMatchObject({ runId: RUN_ID, agent: "billing", tool: "pay_invoice", outcome: "allow" });
        expect(event?.detail).toBe(
            "would block · The IBAN first appeared in web content (supplier-portal.example), not in supplier records",
        );
    });
});

describe("latestDecisions edge cases", () => {
    const at = NOW - MINUTE;

    it("leaves out runs that ended before the window, old steps and steps without a guard", () => {
        useRun([stepOf({ startedAt: at, guard: guardOf() })], NOW - 11 * MINUTE);
        expect(latestDecisions()).toEqual([]);

        useRun([
            stepOf({ id: "1", startedAt: NOW - 11 * MINUTE, guard: guardOf() }),
            stepOf({ id: "2", startedAt: at }),
            stepOf({ id: "3", startedAt: at, guard: guardOf({ guard: "limit", outcome: "allow" }) }),
        ]);
        expect(latestDecisions()).toEqual([]);
    });

    it("keeps counter checks that blocked the call", () => {
        useRun([
            stepOf({ startedAt: at, guard: guardOf({ guard: "limit", outcome: "block", reason: "Email 21 of 20" }) }),
        ]);
        expect(latestDecisions()).toEqual([
            {
                at,
                agent: "billing",
                tool: "lookup_supplier",
                guard: "limit",
                outcome: "block",
                runId: RUN_ID,
                detail: "Email 21 of 20",
            },
        ]);
    });

    it("says a source was unscanned, and shows an observe-mode source block as a pass", () => {
        const output = {
            label: { origin: "web:pay-update.example", trust: "untrusted" as const, sensitivity: "public" as const },
            summary: "",
        };
        useRun([
            stepOf({ id: CALL, startedAt: at - 1, name: "fetch_page", detail: "Fetched pay-update.example", output }),
            stepOf({
                parentId: CALL,
                startedAt: at,
                guard: guardOf({ guard: "source", tool: "fetch_page", outcome: "block", mode: "observe" }),
            }),
        ]);
        const [event] = latestDecisions();
        expect(event.outcome).toBe("pass");
        expect(event.detail).toBe("would block · unscanned · Fetched pay-update.example");
    });

    it("falls back to the guard's reason when the call it checked is not found", () => {
        useRun([
            stepOf({ id: "1", startedAt: at, guard: guardOf({ guard: "source", outcome: "pass", reason: "Labeled" }) }),
            stepOf({
                id: "2",
                startedAt: at + 1,
                guard: guardOf({ guard: "approval", outcome: "ask", mode: null, reason: "Asks first" }),
            }),
        ]);
        expect(latestDecisions().map((event) => event.detail)).toEqual(["Labeled", "Asks first"]);
    });

    it("uses the guard's reason for a source call that returned nothing", () => {
        useRun([
            stepOf({ id: CALL, startedAt: at - 1, name: "fetch_page", error: "timeout" }),
            stepOf({
                parentId: CALL,
                startedAt: at,
                guard: guardOf({ guard: "source", outcome: "pass", reason: "Nothing returned" }),
            }),
        ]);
        expect(latestDecisions()[0].detail).toBe("Nothing returned");
    });

    it("uses the egress reason alone when the call has no recipient", () => {
        useRun([
            stepOf({ id: CALL, startedAt: at - 1, name: "post_slack" }),
            stepOf({
                parentId: CALL,
                startedAt: at,
                guard: guardOf({
                    guard: "egress",
                    tool: "post_slack",
                    reason: "The #deploys webhook is on the allowlist",
                }),
            }),
        ]);
        expect(latestDecisions()[0].detail).toBe("The #deploys webhook is on the allowlist");
    });

    it("writes an observe-mode allow without 'would'", () => {
        useRun([stepOf({ startedAt: at, guard: guardOf({ mode: "observe", reason: "Fine" }) })]);
        expect(latestDecisions()[0]).toMatchObject({ outcome: "allow", detail: "Fine" });
    });

    it("keeps only the 12 newest decisions", () => {
        const steps = Array.from({ length: 15 }, (_, i) =>
            stepOf({ id: String(i), startedAt: at - i * 1000, guard: guardOf({ reason: `#${i}` }) }),
        );
        useRun(steps);
        const events = latestDecisions();
        expect(events.map((event) => event.detail)).toEqual(Array.from({ length: 12 }, (_, i) => `#${11 - i}`));
    });
});
