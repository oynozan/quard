import { afterEach, describe, expect, it, vi } from "vitest";
import { configure } from "../core/config.ts";
import { isGuardRefusal } from "../core/refusal.ts";
import { runScope } from "../context/scope.ts";
import { resetAll } from "../test/reset.ts";
import { guard } from "./guard.ts";

afterEach(() => {
    resetAll();
});

const noop = (_input: unknown) => "done";

describe("approval in the pipeline", () => {
    const approvalFor = (name: string, extra: object[] = []) =>
        guard(
            vi.fn((args: unknown) => args),
            [{ type: "approval", name }, ...extra] as never,
        );

    it("blocks when no approver is set up", async () => {
        const output = await approvalFor("pay")({ amount: 1 });

        expect(isGuardRefusal(output) && output.reason).toBe("approval_unavailable");
    });

    it("blocks when the approver fails", async () => {
        configure({
            approver: async () => {
                throw new Error("dashboard down");
            },
        });

        const output = await approvalFor("pay")({ amount: 1 });

        expect(isGuardRefusal(output) && output.reason).toBe("approval_unavailable");
    });

    it.each(["deny", "no", "", undefined, null, false])("treats the answer %s as a denial", async (answer) => {
        configure({ approver: async () => answer as never });

        const output = await approvalFor("pay")({ amount: 1 });

        expect(isGuardRefusal(output) && output.reason).toBe("approval_denied");
    });

    it("runs with one private copy of the arguments, whatever the caller changes", async () => {
        const args = { amount: 100 };
        const seen: unknown[] = [];
        configure({
            approver: async (request) => {
                args.amount = 10;
                seen.push(request.input);
                return "once";
            },
        });
        const pay = guard((input: { amount: number }) => input.amount, { type: "approval", name: "pay" });

        expect(await pay(args)).toBe(100);
        expect(seen).toEqual([{ amount: 100 }]);
    });

    it("leaves class instances alone so their methods still work", async () => {
        configure({ approver: async () => "once" });
        class Money {
            total = 5;
            format() {
                return `EUR ${this.total}`;
            }
        }
        const pay = guard((input: { money: Money }) => input.money.format(), { type: "approval", name: "pay" });

        expect(await pay({ money: new Money() })).toBe("EUR 5");
    });

    it("refuses a call whose arguments changed while the approver looked", async () => {
        const due = new Date("2026-10-03T00:00:00.000Z");
        configure({
            approver: async () => {
                due.setUTCFullYear(2030);
                return "once";
            },
        });
        const raw = vi.fn((_input: { due: Date }) => "paid");

        const output = await guard(raw, { type: "approval", name: "pay" })({ due });

        expect(isGuardRefusal(output) && output.reason).toBe("approval_required");
        expect(raw).not.toHaveBeenCalled();
    });

    it("remembers always-approved calls for the same agent, tool and arguments", async () => {
        const approver = vi.fn(async () => "always" as const);
        configure({ approver });
        const pay = approvalFor("pay");

        await pay({ amount: 1 });
        await pay({ amount: 1 });
        await pay({ amount: 2 });

        expect(approver).toHaveBeenCalledTimes(2);
    });

    it("never lets an approval override a block that came up while waiting", async () => {
        configure({ approver: async () => "once" });
        let checks = 0;
        const rule = { name: "second-look", check: () => (++checks === 1 ? ("allow" as const) : ("block" as const)) };

        const output = await approvalFor("pay", [{ type: "action", rules: [rule] }])({ amount: 1 });

        expect(isGuardRefusal(output) && output.reason).toBe("rule_failed");
    });

    it("treats other asks as settled by the human", async () => {
        configure({ approver: async () => "once" });
        const rule = { name: "always-ask", check: () => "ask" as const };

        expect(await approvalFor("pay", [{ type: "action", rules: [rule] }])({ amount: 1 })).toEqual({ amount: 1 });
    });

    it("stops waiting after an action guard's timeout when it asks", async () => {
        configure({ approver: () => new Promise<never>(() => {}) });
        const ask = { name: "always-ask", check: () => "ask" as const };
        const pay = guard(noop, { type: "action", name: "pay", rules: [ask], timeout: 0.05 });

        const output = await pay({ amount: 1 });

        expect(isGuardRefusal(output) && output.reason).toBe("approval_timed_out");
    });

    it("waits at most the shortest timeout among the guards that asked", async () => {
        configure({ approver: () => new Promise<never>(() => {}) });
        const ask = { name: "always-ask", check: () => "ask" as const };

        const output = await approvalFor("pay", [{ type: "action", rules: [ask], timeout: 0.05 }])({ amount: 1 });

        expect(isGuardRefusal(output) && output.reason).toBe("approval_timed_out");
    });

    it("ignores the timeout of a guard that did not ask", async () => {
        configure({ approver: () => new Promise((resolve) => setTimeout(() => resolve("once"), 100)) });
        const pass = { name: "pass", check: () => "allow" as const };
        const pay = guard(noop, [
            { type: "approval", name: "pay" },
            { type: "action", rules: [pass], timeout: 0.01 },
        ]);

        expect(await pay({ amount: 1 })).toBe("done");
    });

    it("counts limits right after the re-check, so parallel approvals can't race past them", async () => {
        configure({ approver: async () => "once" });
        const raw = vi.fn(noop);
        const pay = guard(raw, [
            { type: "approval", name: "pay" },
            { type: "limit", maxCallsPerRun: 1 },
        ]);

        await runScope({}, () => Promise.all([pay({ n: 1 }), pay({ n: 2 })]));

        expect(raw).toHaveBeenCalledTimes(1);
    });
});
