import { parseHashKey } from "@quard/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { takeEvents } from "../../core/recorder.ts";
import { makeAskableCall } from "../../test/call.ts";
import { decisionsOf } from "../../test/events.ts";
import { fakeSockets, sentOf } from "../../test/fake-socket.ts";
import { resetAll } from "../../test/reset.ts";
import { PAYEE, USDC } from "../../test/x402.ts";
import { setActiveControl } from "../../transport/link/active.ts";
import { createControl, type Control } from "../../transport/link/control.ts";
import type { RuleResult } from "../call.ts";
import { dayUsed, utcDay } from "../limit/daily.ts";
import { markShared } from "../limit/run-counts.ts";
import type { X402Options } from "../options.ts";
import { DAY_COUNTER, paymentsKey, usdKey } from "./checks.ts";
import { countPayment, reportRefusedPayee } from "./count.ts";
import type { Payment } from "./payment.ts";
import { x402Settings } from "./settings.ts";

let control: Control | undefined;

function linked() {
    const fake = fakeSockets();
    control = createControl({ url: "ws://c", key: "k", hashKey: parseHashKey("ab".repeat(32)), open: fake.open });
    setActiveControl(control);
    return { fake, control };
}

const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
    vi.useFakeTimers({ now: Date.parse("2026-10-03T12:00:00.000Z") });
});

afterEach(() => {
    control?.stop();
    control = undefined;
    setActiveControl(undefined);
    resetAll();
    vi.useRealTimers();
});

function paymentOf(usd: number | null = 0.25): Payment {
    return {
        x402Version: 2,
        scheme: "exact",
        network: "eip155:84532",
        asset: USDC,
        amount: "250000",
        validAmount: true,
        usd,
        payTo: PAYEE,
        resource: "https://api.paid.dev/weather",
        host: "api.paid.dev",
    };
}

function count(options: Omit<X402Options, "type">, call = makeAskableCall({}, [], "x402"), checked: RuleResult[] = []) {
    const settings = x402Settings({ type: "x402", fleetCheck: false, ...options });
    return { call, counted: countPayment(call, paymentOf(), settings, checked) };
}

describe("countPayment in this process", () => {
    it("counts the run's payments and USD, and refuses past an enforced cap", async () => {
        const call = makeAskableCall({}, [], "x402");

        expect(await count({ maxPaymentsPerRun: 1 }, call).counted).toBeUndefined();
        expect(await count({ maxPaymentsPerRun: 1 }, call).counted).toMatchObject({
            rule: "max-payments-per-run",
            reason: "x402_too_many_payments",
        });

        expect(call.run.counters.get(paymentsKey("x402"))).toBe(1);
        expect(call.run.counters.get(usdKey("x402"))).toBe(0.25);
        expect(dayUsed(utcDay(), "x402", DAY_COUNTER)).toBe(0.25);
    });

    it("records a run cap passed in observe mode once", async () => {
        const call = makeAskableCall({}, [], "x402");
        const flagged: RuleResult = {
            guard: "x402",
            rule: "max-per-run",
            decision: "block",
            mode: "observe",
            reason: "x402_over_run_limit",
        };
        call.run.counters.set(usdKey("x402"), 5);

        expect(await count({}, call).counted).toBeUndefined();
        expect(await count({}, call, [flagged]).counted).toBeUndefined();

        expect(decisionsOf(takeEvents()).map((event) => [event.rule, event.mode])).toEqual([
            ["max-per-run", "observe"],
        ]);
    });

    it("counts a payment with no USD value only as a payment", async () => {
        const call = makeAskableCall({}, [], "x402");
        const settings = x402Settings({ type: "x402", fleetCheck: false });

        await countPayment(call, paymentOf(null), settings, []);
        await countPayment(call, paymentOf(0), settings, []);

        expect(call.run.counters.get(paymentsKey("x402"))).toBe(2);
        expect(call.run.counters.has(usdKey("x402"))).toBe(false);
        expect(dayUsed(utcDay(), "x402", DAY_COUNTER)).toBe(0);
    });

    it("takes back the run's counts when the day cap refuses", async () => {
        const call = makeAskableCall({}, [], "x402");

        expect(await count({ maxPerDay: 0.1 }, call).counted).toMatchObject({ reason: "x402_over_day_limit" });

        expect(call.run.counters.get(paymentsKey("x402"))).toBe(0);
        expect(call.run.counters.get(usdKey("x402"))).toBe(0);
    });
});

describe("countPayment through control", () => {
    it("counts the day in control with the enforced cap, and refuses what control refuses", async () => {
        const { fake } = linked();
        const socket = fake.connect();

        const { counted } = count({ maxPerDay: 1 });
        await settle();
        const [sent] = sentOf(socket, "count");
        socket.reply({ type: "counted", id: sent?.id as string, ok: false, used: [0.9] });

        expect(sent).toMatchObject({ tool: "x402", counts: [{ counter: "amount:usd", add: 0.25, max: 1 }] });
        expect(await counted).toMatchObject({ rule: "max-per-day", mode: "block" });
    });

    it("adds to a shared run's counters in control, which keeps them on a refusal", async () => {
        const { fake } = linked();
        const socket = fake.connect();
        const call = makeAskableCall({}, [], "x402");
        markShared(call.run);

        const { counted } = count({ maxPerDay: 1 }, call);
        await settle();
        const [run] = sentOf(socket, "run_count");
        socket.reply({ type: "run_counted", id: run?.id as string, ok: true, used: [1, 0.25] });
        await settle();
        const [day] = sentOf(socket, "count");
        socket.reply({ type: "counted", id: day?.id as string, ok: false, used: [1] });

        expect(run?.counts.map((item) => item.counter)).toEqual(["calls:x402", "amount:x402:usd"]);
        expect(await counted).toMatchObject({ rule: "max-per-day" });
        expect(call.run.counters.get(paymentsKey("x402"))).toBe(1);
    });

    it("reports the payee and refuses it once quarantined", async () => {
        const { fake } = linked();
        const socket = fake.connect();
        const key = `wallet:${PAYEE.toLowerCase()}`;

        const { counted } = count({ fleetCheck: true });
        await settle();
        sentOf(socket, "count").forEach((sent) =>
            socket.reply({ type: "counted", id: sent.id, ok: true, used: sent.counts.map((found) => found.add) }),
        );
        await settle();
        const [use] = sentOf(socket, "fleet");
        socket.reply({
            type: "fleet_result",
            id: use?.id as string,
            quarantined: [{ key, observe: false }],
            fleetObserveUntil: null,
        });

        expect(use?.values).toEqual([{ field: "payTo", kind: "wallet", key }]);
        expect(await counted).toMatchObject({ rule: "fleet-check", reason: "x402_payee_quarantined", mode: "block" });
    });

    it("records a quarantined payee in observe mode once and lets it pay", async () => {
        const { fake } = linked();
        const socket = fake.connect();
        const key = `wallet:${PAYEE.toLowerCase()}`;
        const answer = async (checked: RuleResult[]) => {
            const { counted } = count({ fleetCheck: true, mode: "observe" }, undefined, checked);
            await settle();
            sentOf(socket, "count").forEach((sent) =>
                socket.reply({ type: "counted", id: sent.id, ok: true, used: sent.counts.map((found) => found.add) }),
            );
            await settle();
            const use = sentOf(socket, "fleet").at(-1);
            socket.reply({
                type: "fleet_result",
                id: use?.id as string,
                quarantined: [{ key, observe: false }],
                fleetObserveUntil: null,
            });
            return counted;
        };
        const flagged: RuleResult = {
            guard: "x402",
            rule: "fleet-check",
            decision: "block",
            mode: "observe",
            reason: "x402_payee_quarantined",
        };

        expect(await answer([])).toBeUndefined();
        expect(await answer([flagged])).toBeUndefined();

        expect(decisionsOf(takeEvents()).filter((event) => event.rule === "fleet-check")).toHaveLength(1);
    });

    it("lets a payee control does not know pay", async () => {
        const { fake } = linked();
        const socket = fake.connect();

        const { counted } = count({ fleetCheck: true, maxPerDay: 100 });
        await settle();
        sentOf(socket, "count").forEach((sent) =>
            socket.reply({ type: "counted", id: sent.id, ok: true, used: sent.counts.map((found) => found.add) }),
        );
        await settle();
        const [use] = sentOf(socket, "fleet");
        socket.reply({ type: "fleet_result", id: use?.id as string, quarantined: [], fleetObserveUntil: null });

        expect(await counted).toBeUndefined();
    });

    it("keeps the report for later while control is away", async () => {
        const { control } = linked();
        const keep = vi.spyOn(control.replays, "keepUse");

        expect(await count({ fleetCheck: true }).counted).toBeUndefined();

        expect(keep).toHaveBeenCalledWith(expect.objectContaining({ tool: "x402", blocked: false }));
    });
});

describe("reportRefusedPayee", () => {
    it("counts a refused payment as a use of its payee", () => {
        const { control } = linked();
        const use = vi.spyOn(control.replays, "use");
        const call = makeAskableCall({}, [], "x402");

        reportRefusedPayee(call, paymentOf(), x402Settings({ type: "x402" }));
        reportRefusedPayee(call, paymentOf(), x402Settings({ type: "x402", fleetCheck: false }));

        expect(use).toHaveBeenCalledTimes(1);
        expect(use).toHaveBeenCalledWith(expect.objectContaining({ blocked: true }));
    });

    it("does nothing without control", () => {
        expect(() =>
            reportRefusedPayee(makeAskableCall({}, [], "x402"), paymentOf(), x402Settings({ type: "x402" })),
        ).not.toThrow();
    });
});
