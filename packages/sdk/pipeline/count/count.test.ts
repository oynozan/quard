import { parseHashKey } from "@quard/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dayUsed, utcDay } from "../../guards/limit/daily.ts";
import { markShared } from "../../guards/limit/run-counts.ts";
import { makeAskableCall } from "../../test/call.ts";
import { fakeSockets, sentOf } from "../../test/fake-socket.ts";
import { resetAll } from "../../test/reset.ts";
import { setActiveControl } from "../../transport/link/active.ts";
import { createControl } from "../../transport/link/control.ts";
import { countCall } from "./count.ts";

beforeEach(() => {
    vi.useFakeTimers({ now: Date.parse("2026-10-03T12:00:00.000Z") });
});

afterEach(() => {
    resetAll();
    vi.useRealTimers();
});

describe("countCall", () => {
    it("counts per-run limits at once and per-day ones after", async () => {
        const call = makeAskableCall({});

        expect(
            await countCall(call, [{ type: "approval" }, { type: "limit", maxCallsPerRun: 3, maxCallsPerDay: 3 }], []),
        ).toBeUndefined();

        expect([...call.run.counters.values()]).toEqual([1]);
    });

    it("takes the per-run counts back when a per-day limit refuses the call", async () => {
        const call = makeAskableCall({});
        const list = [
            { type: "limit" as const, maxCallsPerRun: 5 },
            { type: "limit" as const, maxCallsPerDay: 1 },
        ];
        await countCall(call, list, []);

        expect(await countCall(call, list, [])).toMatchObject({ rule: "max-calls-per-day" });
        expect([...call.run.counters.values()]).toEqual([1]);
    });

    it("adds once to a per-day counter that two guards share", async () => {
        const list = [
            { type: "limit" as const, maxCallsPerDay: 5 },
            { type: "limit" as const, maxCallsPerDay: 5, mode: "observe" as const },
        ];

        expect(await countCall(makeAskableCall({}), list, [])).toBeUndefined();
        expect(dayUsed(utcDay(), "payInvoice", "calls")).toBe(1);
    });

    it("reports watched values to control after the per-day counts", async () => {
        const fake = fakeSockets();
        const control = createControl({
            url: "ws://c",
            key: "k",
            hashKey: parseHashKey("ab".repeat(32)),
            open: fake.open,
        });
        setActiveControl(control);

        const counted = countCall(
            makeAskableCall({ url: "https://evil-pay.com" }),
            [{ type: "limit", fleetCheck: ["url"] }],
            [],
        );

        expect(await counted).toBeUndefined();
        expect(sentOf(fake.connect(), "fleet")).toHaveLength(1);
        control.stop();
    });
});

function linkedControl() {
    const fake = fakeSockets();
    const control = createControl({ url: "ws://c", key: "k", hashKey: parseHashKey("ab".repeat(32)), open: fake.open });
    setActiveControl(control);
    return { control, socket: fake.connect() };
}

function sharedCall(input: object) {
    const call = makeAskableCall(input);
    markShared(call.run);
    return call;
}

const settle = () => vi.advanceTimersByTimeAsync(0);

describe("countCall for a run that spans processes", () => {
    it("counts per-run limits through control and delegation here", async () => {
        const { control, socket } = linkedControl();
        const call = sharedCall({ to: "helper" });

        const counted = countCall(call, [{ type: "limit", maxCallsPerRun: 3, delegateTo: "to" }], []);
        await settle();
        const [count] = sentOf(socket, "run_count");
        socket.reply({ type: "run_counted", id: count?.id as string, ok: true, used: [2] });

        expect(await counted).toBeUndefined();
        expect(count?.counts).toEqual([{ counter: "calls:payInvoice", add: 1, max: 3 }]);
        expect(call.run.counters.get("calls:payInvoice")).toBe(2);
        expect(call.run.helpers.get("billing")).toEqual(new Set(["helper"]));
        control.stop();
    });

    it("counts per-run limits first, then the per-day counts and the fleet check", async () => {
        const { control, socket } = linkedControl();
        const call = sharedCall({ url: "https://acme.com" });
        const list = [{ type: "limit" as const, maxCallsPerRun: 3, maxCallsPerDay: 3, fleetCheck: ["url"] }];

        const counted = countCall(call, list, []);
        await settle();
        const [runCount] = sentOf(socket, "run_count");
        socket.reply({ type: "run_counted", id: runCount?.id as string, ok: true, used: [1] });
        await settle();
        const [count] = sentOf(socket, "count");
        socket.reply({ type: "counted", id: count?.id as string, ok: true, used: 1 });
        await settle();
        const [fleet] = sentOf(socket, "fleet");
        socket.reply({ type: "fleet_result", id: fleet?.id as string, quarantined: [], fleetObserveUntil: null });

        expect(await counted).toBeUndefined();
        expect(socket.sent.map((message) => message.type).slice(1)).toEqual(["run_count", "count", "fleet"]);
        control.stop();
    });

    it("sends no per-day count and no fleet report when a per-run limit refuses the call", async () => {
        const { control, socket } = linkedControl();
        const call = sharedCall({ url: "https://acme.com", to: "helper" });
        const list = [
            { type: "limit" as const, maxCallsPerRun: 3, maxCallsPerDay: 9, fleetCheck: ["url"], delegateTo: "to" },
        ];

        const counted = countCall(call, list, []);
        await settle();
        const [runCount] = sentOf(socket, "run_count");
        socket.reply({ type: "run_counted", id: runCount?.id as string, ok: false, used: [3] });

        expect(await counted).toMatchObject({ rule: "max-calls-per-run" });
        expect(socket.sent.map((message) => message.type).slice(1)).toEqual(["run_count"]);
        expect([...(call.run.helpers.get("billing") ?? [])]).toEqual([]);
        control.stop();
    });

    it("uses no per-day slot for parallel calls a per-run limit refuses", async () => {
        const call = sharedCall({});
        const list = [{ type: "limit" as const, maxCallsPerRun: 2, maxCallsPerDay: 100 }];

        const outs = await Promise.all(Array.from({ length: 6 }, () => countCall(call, list, [])));

        expect(outs.filter((out) => out === undefined)).toHaveLength(2);
        expect(dayUsed(utcDay(), "payInvoice", "calls")).toBe(2);
    });

    it("keeps the per-run count but takes back the delegation when the fleet check refuses the call", async () => {
        const { control, socket } = linkedControl();
        const call = sharedCall({ url: "https://evil-pay.com", to: "helper" });
        const list = [{ type: "limit" as const, maxCallsPerRun: 3, fleetCheck: ["url"], delegateTo: "to" }];

        const counted = countCall(call, list, []);
        await settle();
        const [runCount] = sentOf(socket, "run_count");
        socket.reply({ type: "run_counted", id: runCount?.id as string, ok: true, used: [1] });
        await settle();
        const [fleet] = sentOf(socket, "fleet");
        const quarantined = [{ key: "domain:evil-pay.com", observe: false }];
        socket.reply({ type: "fleet_result", id: fleet?.id as string, quarantined, fleetObserveUntil: null });

        expect(await counted).toMatchObject({ rule: "fleet-check" });
        expect(call.run.counters.get("calls:payInvoice")).toBe(1);
        expect([...(call.run.helpers.get("billing") ?? [])]).toEqual([]);
        control.stop();
    });

    it("keeps the per-run count when a per-day limit refuses the call", async () => {
        const call = sharedCall({});
        const list = [{ type: "limit" as const, maxCallsPerRun: 5, maxCallsPerDay: 1 }];
        await countCall(call, list, []);

        expect(await countCall(call, list, [])).toMatchObject({ rule: "max-calls-per-day" });
        expect(call.run.counters.get("calls:payInvoice")).toBe(2);
    });
});
