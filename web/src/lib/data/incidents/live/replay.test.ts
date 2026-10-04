// @vitest-environment node
import { describe, expect, it } from "vitest";
import { incidentRow, storedReplay, storedVerdict } from "../../../../../test/incidents/rows";
import { at, storedRun } from "../../../../../test/runs-fixture";
import { runDetailOf } from "../../runs/live/detail";
import { replayOf, replayStatus } from "./replay";

const run = runDetailOf(storedRun(), at(30).getTime());
const round = (harmful: [number, number], pValue: number, costUsd: number, seconds: number) => ({
    with: { runs: 5, harmful: harmful[0] },
    without: { runs: 5, harmful: harmful[1] },
    pValue,
    costUsd,
    finishedAt: at(seconds).toISOString(),
});

describe("replayStatus", () => {
    it("says queued until a worker claims the replay, and replaying only while it has it", () => {
        expect(replayStatus({ replayState: "requested", replay: null })).toBe("queued");
        // Continuing past the cap queues the replay again
        const capped = storedReplay({ outcome: "cap reached" });
        expect(replayStatus({ replayState: "requested", replay: capped })).toBe("queued");
        expect(replayStatus({ replayState: "running", replay: storedReplay() })).toBe("running");
    });

    it("reads a limit, a failure, an outcome, or that it never started", () => {
        const limited = storedReplay({ limited: "Replay limited: the turning-point request was not recorded" });
        expect(replayStatus({ replayState: "failed", replay: limited })).toBe("limited");
        expect(replayStatus({ replayState: "failed", replay: storedReplay({ error: "Boom" }) })).toBe("failed");
        expect(replayStatus({ replayState: "done", replay: storedReplay({ outcome: "cap reached" }) })).toBe(
            "cap reached",
        );
        expect(replayStatus({ replayState: "idle", replay: null })).toBe("not started");
    });
});

describe("replayOf", () => {
    it("takes the setup from the verdict and the turning point before the first replay", () => {
        expect(replayOf(incidentRow({ spentUsd: 0.01 }), storedVerdict(), run)).toEqual({
            status: "not started",
            rounds: [],
            threshold: 0.0182,
            model: "gpt-5.4-mini",
            harmfulCall: "payInvoice with iban GB33…5555",
            removedContent: "Content from acme-billing.net",
            costUsd: 0.01,
            capUsd: 5,
            reason: null,
        });
    });

    it("names only the tool when the entry held no value, and no model when the turning point is gone", () => {
        const verdict = storedVerdict();
        const bare = {
            ...verdict,
            entry: { ...verdict.entry, key: null },
            turning: { ...verdict.turning, stepId: "x" },
        };
        expect(replayOf(incidentRow(), bare, run)).toMatchObject({ harmfulCall: "payInvoice", model: "" });
    });

    it("adds up the stored rounds and reads the stored setup", () => {
        const stored = storedReplay({
            model: "gpt-6.1",
            harmfulCall: { tool: "payInvoice", keys: ["iban:DE89…3000#abc", "email:j…@acme.com#def"] },
            removed: { contentId: null, origin: "email:inbox", callId: null },
            rounds: [round([4, 0], 0.0238, 0.05, 40), round([3, 1], 0.0099, 0.06, 90)],
            outcome: "confirmed",
        });
        const row = incidentRow({ replayState: "done", replay: stored, spentUsd: 0.12, capUsd: 10 });
        expect(replayOf(row, storedVerdict(), run)).toEqual({
            status: "confirmed",
            rounds: [
                {
                    round: 1,
                    withContent: { runs: 5, harmful: 4 },
                    withoutContent: { runs: 5, harmful: 0 },
                    totalWith: { runs: 5, harmful: 4 },
                    totalWithout: { runs: 5, harmful: 0 },
                    pValue: 0.0238,
                    costUsd: 0.05,
                    finishedAt: at(40).getTime(),
                },
                {
                    round: 2,
                    withContent: { runs: 5, harmful: 3 },
                    withoutContent: { runs: 5, harmful: 1 },
                    totalWith: { runs: 10, harmful: 7 },
                    totalWithout: { runs: 10, harmful: 1 },
                    pValue: 0.0099,
                    costUsd: 0.06,
                    finishedAt: at(90).getTime(),
                },
            ],
            threshold: 0.0182,
            model: "gpt-6.1",
            harmfulCall: "payInvoice with iban DE89…3000, email j…@acme.com",
            removedContent: "Content from inbox",
            costUsd: 0.12,
            capUsd: 10,
            reason: null,
        });
    });

    it("says why the replay is limited or failed", () => {
        const limited = storedReplay({ limited: "Replay limited: earlier conversation history was not recorded" });
        const failed = storedReplay({ error: "Set OPENAI_API_KEY on the worker to run replay" });
        const reasonOf = (replay: typeof limited) =>
            replayOf(incidentRow({ replayState: "failed", replay }), storedVerdict(), run).reason;
        expect(reasonOf(limited)).toBe("Replay limited: earlier conversation history was not recorded");
        expect(reasonOf(failed)).toBe("Set OPENAI_API_KEY on the worker to run replay");
    });
});
