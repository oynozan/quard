import type { RunEvent } from "@quard/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { configure } from "../core/config.ts";
import { isGuardRefusal } from "../core/refusal.ts";
import { decisionsOf } from "../test/events.ts";
import { resetAll } from "../test/reset.ts";
import { guardWithSignal } from "./guard.ts";

afterEach(() => {
    resetAll();
});

function payWith(options: object) {
    const raw = vi.fn((_input: { amount: number }) => "paid");
    return { raw, pay: guardWithSignal(raw, { name: "pay", ...options } as never) };
}

describe("guardWithSignal", () => {
    it("runs a call whose signal never aborts", async () => {
        const { raw, pay } = payWith({ type: "limit", maxCallsPerRun: 5 });

        expect(await pay(new AbortController().signal, [{ amount: 1 }])).toBe("paid");
        expect(raw).toHaveBeenCalledTimes(1);
    });

    it("throws the abort reason for a call aborted before it starts", async () => {
        const { raw, pay } = payWith({ type: "limit", maxCallsPerRun: 5 });

        await expect(pay(AbortSignal.abort(new Error("gone")), [{ amount: 1 }])).rejects.toThrow("gone");
        expect(raw).not.toHaveBeenCalled();
    });

    it("stops waiting for approval when the call aborts, and never runs the tool", async () => {
        let answer: (value: "once") => void = () => undefined;
        configure({ approver: () => new Promise((resolve) => (answer = resolve)) });
        const { raw, pay } = payWith({ type: "approval" });
        const controller = new AbortController();

        const output = pay(controller.signal, [{ amount: 1 }]);
        await new Promise((resolve) => setImmediate(resolve));
        controller.abort();
        const refused = await output;
        answer("once");

        expect(isGuardRefusal(refused) && refused.reason).toBe("approval_timed_out");
        expect(raw).not.toHaveBeenCalled();
    });

    it("never runs a call that aborted right after its approval", async () => {
        const controller = new AbortController();
        const events: RunEvent[] = [];
        // The abort lands just as the approval is recorded
        const onEvent = (event: RunEvent) => {
            events.push(event);
            if (event.type === "decision" && event.guard === "approval" && event.decision === "allow") {
                controller.abort();
            }
        };
        configure({ onEvent, approver: async () => "once" });
        const { raw, pay } = payWith({ type: "approval" });

        const refused = await pay(controller.signal, [{ amount: 1 }]);

        expect(isGuardRefusal(refused) && refused.reason).toBe("call_aborted");
        expect(raw).not.toHaveBeenCalled();
        expect(decisionsOf(events).map((event) => `${event.rule}:${event.decision}`)).toContain("aborted:block");
    });
});

// Aborts the call as soon as its limit check is recorded
function abortOnLimit(controller: AbortController) {
    const events: RunEvent[] = [];
    const onEvent = (event: RunEvent) => {
        events.push(event);
        if (event.type === "decision" && event.guard === "limit") {
            controller.abort();
        }
    };
    configure({ onEvent });
    return events;
}

describe("a call aborted before it ran", () => {
    it("is recorded with its own guard and reason, not as an approval", async () => {
        const controller = new AbortController();
        const events = abortOnLimit(controller);
        const { pay } = payWith({ type: "limit", maxCallsPerRun: 5 });

        const refused = await pay(controller.signal, [{ amount: 1 }]);

        expect(isGuardRefusal(refused) && refused.guard).toBe("abort");
        expect(String(refused)).toContain("the call was cancelled before it ran");
        const decisions = decisionsOf(events);
        expect(decisions.filter((event) => event.guard === "approval")).toEqual([]);
        expect(decisions).toContainEqual(
            expect.objectContaining({ guard: "abort", rule: "aborted", decision: "block", reason: "call_aborted" }),
        );
    });
});
