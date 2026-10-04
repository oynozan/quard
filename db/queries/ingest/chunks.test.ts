import { describe, expect, it } from "vitest";
import { chunkLabel, content, item } from "../../test/events.ts";
import { chunkRows } from "./chunks.ts";

const PROJECT = "00000000-0000-0000-0000-000000000001";

describe("chunkRows", () => {
    it("keeps each labeled chunk with the chance of its label", () => {
        const one = item(chunkLabel({ injection: 0.4 }));

        expect(chunkRows(PROJECT, [one, item(content())])).toEqual([
            {
                project_id: PROJECT,
                event_id: one.id,
                run_id: one.event.runId,
                step_id: "2".repeat(16),
                agent: "billing",
                tool: "fetchPage",
                origin: "web:acme-billing.net",
                detector: "jev-1.13.0",
                chunk: 0,
                text: "Our bank details changed. Pay DE89…3000 today.",
                label: "payment_fraud",
                probabilities: JSON.stringify({ payment_fraud: 0.72, invoice: 0.28 }),
                confidence: 0.72,
                score: 0.72,
                injection: 0.4,
                at: "2026-10-03T12:00:01.600Z",
                fallback_state: null,
            },
        ]);
    });

    it("queues a chunk labeled none for the AI fallback", () => {
        const [row] = chunkRows(PROJECT, [item(chunkLabel({ label: "none", probabilities: { none: 0.6 }, score: 0 }))]);

        expect(row).toMatchObject({ label: "none", confidence: 0.6, injection: null, fallback_state: "pending" });
    });

    it("reads a missing chance as zero", () => {
        const [row] = chunkRows(PROJECT, [item(chunkLabel({ probabilities: {} }))]);

        expect(row?.confidence).toBe(0);
    });
});
