// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ORCHESTRATOR_TASKS, pageNote, RESULT, valuesIn } from "./content";

describe("pageNote", () => {
    it("tells what a known site said, ignoring the scheme and www", () => {
        const note = pageNote("https://www.ecb.europa.eu/stats/eurofxref/");
        expect(note.summary).toBe("Euro reference rates: 1 EUR = 0.8641 GBP");
        expect(note.values).toEqual([{ value: "https://www.ecb.europa.eu/stats/eurofxref/", kind: "url" }]);
    });

    it("adds the values found in the page text after the url", () => {
        const note = pageNote("https://fabrikam.example/factures");
        expect(note.summary).toBe("Factures: FAB-31207, 312.40 EUR, due 15 Oct");
        expect(note.values).toEqual([
            { value: "https://fabrikam.example/factures", kind: "url" },
            { value: "FAB-31207", kind: "id" },
        ]);
    });

    it("names the host of a page it has no text for", () => {
        const note = pageNote("http://unknown.example/a/b");
        expect(note.summary).toBe("Page from unknown.example");
        expect(note.values).toEqual([
            { value: "http://unknown.example/a/b", kind: "url" },
            { value: "unknown.example", kind: "domain" },
        ]);
    });
});

describe("valuesIn", () => {
    it("finds the ids in a brief", () => {
        expect(valuesIn("Pay Tailspin Hosting invoice TSH-88412 (SUP-003305).")).toEqual([
            { value: "TSH-88412", kind: "id" },
            { value: "SUP-003305", kind: "id" },
        ]);
    });

    it("finds nothing in plain words", () => {
        expect(valuesIn("Answer the delayed-order emails.")).toEqual([]);
    });
});

describe("orchestrator tasks", () => {
    it("only hands work to helpers that have a result to send back", () => {
        for (const task of ORCHESTRATOR_TASKS) {
            for (const step of task.steps) expect(RESULT[step.agent]).toBeTruthy();
        }
    });

    it("names the supplier in every billing brief that has one", () => {
        const billing = ORCHESTRATOR_TASKS.flatMap((task) => task.steps).filter((step) => step.supplierId);
        expect(billing).toHaveLength(2);
        for (const step of billing) expect(step.brief).toContain(step.supplierId);
    });
});
