import { afterEach, describe, expect, it, vi } from "vitest";
import { configure } from "../../core/config.ts";
import { takeEvents } from "../../core/recorder.ts";
import { DetectorError } from "../../detectors/detector.ts";
import type { DetectorAnswer } from "../../detectors/labels.ts";
import { makeCall } from "../../test/call.ts";
import { ARTICLE, fake, INJECTED, LONG, PAGE, web } from "../../test/detector.ts";
import { decisionsOf } from "../../test/events.ts";
import { resetAll } from "../../test/reset.ts";
import { detectContent } from "./detect.ts";

afterEach(() => {
    resetAll();
    vi.useRealTimers();
});

const stuck = () => new Promise<DetectorAnswer>(() => undefined);
const warnings = (events: ReturnType<typeof takeEvents>) => events.filter((event) => event.type === "warning");
// Ten texts of two chunks each: more requests than may run at once
const WIDE = Array.from({ length: 10 }, (_, i) => `${i} ${"word ".repeat(900)}`);

describe("detectContent when the detector fails", () => {
    it.each([
        { what: "throws", answer: () => Promise.reject(new Error("model down")), reason: "error" },
        { what: "says why", answer: () => Promise.reject(new DetectorError("http_401")), reason: "http_401" },
        {
            what: "gives a label Quard did not offer",
            answer: () => ({ label: "spam", probabilities: {} }),
            reason: "bad_reply",
        },
        {
            what: "gives a chance above 1",
            answer: () => ({ label: "article", probabilities: { article: 1.5 } }),
            reason: "bad_reply",
        },
    ])("flags the content as unchecked when the detector $what", async ({ answer, reason }) => {
        configure({ detector: fake(answer as () => DetectorAnswer) });

        const shown = await detectContent(makeCall({}), web(PAGE), true);

        expect(shown).toEqual({ output: PAGE, label: { ...web(PAGE).label, flags: ["detector:unchecked"] } });
        const events = takeEvents();
        expect(decisionsOf(events)).toMatchObject([
            { decision: "flag", enforced: true, reason: "unchecked", score: 0 },
        ]);
        expect(warnings(events)).toMatchObject([{ code: "detector_error", tool: "testTool", reason }]);
    });

    it("cuts a long failure reason to what a warning event holds", async () => {
        configure({ detector: fake(() => Promise.reject(new DetectorError("x".repeat(300)))) });

        await detectContent(makeCall({}), web(PAGE), true);

        expect(warnings(takeEvents())).toMatchObject([{ reason: "x".repeat(200) }]);
    });

    it("acts on the chunks that answered when another fails", async () => {
        configure({
            detector: fake((text) => (text.includes("forward") ? INJECTED : Promise.reject(new Error("down")))),
        });

        const shown = await detectContent(makeCall({}), web(PAGE), true);

        expect(shown.output).toBe(LONG);
        expect(shown.label.flags).toEqual(["detector:prompt_injection", "detector:unchecked"]);
        const events = takeEvents();
        expect(decisionsOf(events)).toMatchObject([{ decision: "strip", reason: "prompt_injection,unchecked" }]);
        expect(events.filter((event) => event.type === "chunk_label")).toMatchObject([{ chunk: 1 }]);
    });

    it("records what it would do in observe mode, and leaves the content as it is", async () => {
        configure({
            detector: fake(() => Promise.reject(new Error("model down"))),
            detectorRules: { mode: "observe" },
        });
        const shown = web(PAGE);

        expect(await detectContent(makeCall({}), shown, true)).toBe(shown);
        await vi.waitFor(() => {
            const events = takeEvents();
            expect(decisionsOf(events)).toMatchObject([{ decision: "flag", mode: "observe", enforced: false }]);
            expect(warnings(events)).toMatchObject([{ code: "detector_error", reason: "error" }]);
        });
    });

    it("stops waiting after 5 seconds and flags what did not answer", async () => {
        vi.useFakeTimers();
        const detector = fake(stuck);
        configure({ detector });

        const pending = detectContent(makeCall({}), web(PAGE), true);
        await vi.advanceTimersByTimeAsync(5000);

        expect((await pending).label.flags).toEqual(["detector:unchecked"]);
        expect(warnings(takeEvents())).toMatchObject([{ reason: "timeout" }]);
        expect(detector.label.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    });

    it("sends no request still waiting for its turn at the deadline", async () => {
        vi.useFakeTimers();
        const detector = fake(stuck);
        configure({ detector });

        const pending = detectContent(makeCall({}), web(WIDE), true);
        await vi.advanceTimersByTimeAsync(5000);
        await pending;

        expect(detector.label).toHaveBeenCalledTimes(8);
    });

    it("answers a short read in time while a long page waits for its turn", async () => {
        vi.useFakeTimers();
        const slow = () => new Promise<DetectorAnswer>((resolve) => setTimeout(() => resolve(ARTICLE), 800));
        configure({ detector: fake(slow) });
        // 120 requests: far more than 8 places can answer in 5 s
        const page = Array.from({ length: 60 }, (_, i) => `${i} ${"word ".repeat(900)}`);
        const long = detectContent(makeCall({}), web(page), true);

        const short = detectContent(makeCall({}), web("A short note."), true);
        await vi.advanceTimersByTimeAsync(5000);

        expect((await short).label.flags).toEqual([]);
        expect((await long).label.flags).toEqual(["detector:unchecked"]);
    });

    it("frees its places when a detector ignores the deadline", async () => {
        vi.useFakeTimers();
        configure({ detector: fake(stuck) });
        const first = detectContent(makeCall({}), web(WIDE), true);
        await vi.advanceTimersByTimeAsync(5000);
        await first;
        vi.useRealTimers();
        configure({ detector: fake(() => ARTICLE) });

        const shown = await detectContent(makeCall({}), web(PAGE), true);

        expect(shown.label.flags).toEqual([]);
    });
});
