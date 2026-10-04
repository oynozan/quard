import { parseHashKey, type ReadyMessage, type RunEvent } from "@quard/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { configure } from "../core/config.ts";
import { isGuardRefusal } from "../core/refusal.ts";
import { runScope } from "../context/scope.ts";
import { dayUsed, utcDay } from "../guards/limit/daily.ts";
import { rulesSnapshot } from "../policy/rules.ts";
import { decisionsOf } from "../test/events.ts";
import { fakeSockets, READY, sentOf, type FakeSocket } from "../test/fake-socket.ts";
import { resetAll } from "../test/reset.ts";
import { setActiveControl } from "../transport/link/active.ts";
import { createControl, type Control, type ControlTiming } from "../transport/link/control.ts";
import { guard } from "./guard.ts";

const IBAN = "DE89370400440532013000";
const REQUEST = `apr_${"1".repeat(16)}`;
const PAST = "2026-01-01T00:00:00.000Z";
const FUTURE = "2999-01-01T00:00:00.000Z";

let control: Control | undefined;
let events: RunEvent[] = [];

afterEach(() => {
    control?.stop();
    control = undefined;
    resetAll();
});

// A control link over a fake socket, connected unless told otherwise
function linked(ready: ReadyMessage | false = READY, timing: Partial<ControlTiming> = {}) {
    events = [];
    configure({ onEvent: (event) => events.push(event) });
    const fake = fakeSockets();
    control = createControl({
        url: "ws://c",
        key: "k",
        hashKey: parseHashKey("ab".repeat(32)),
        open: fake.open,
        timing,
    });
    setActiveControl(control);
    return { fake, socket: ready === false ? fake.last() : fake.connect(ready) };
}

async function nextAsk(socket: FakeSocket) {
    await vi.waitFor(() => expect(sentOf(socket, "ask")).toHaveLength(1));
    return sentOf(socket, "ask")[0]?.askId as string;
}

describe("approvals through control", () => {
    it("waits for the dashboard, then runs the tool with exactly the approved arguments", async () => {
        const { socket } = linked();
        const raw = vi.fn(async (input: { iban: string; amount: number }) => `paid ${input.amount}`);
        const payInvoice = guard(raw, { type: "approval", name: "payInvoice" });

        const out = runScope({ agent: "billing" }, () => payInvoice({ iban: IBAN, amount: 4950 }));
        const askId = await nextAsk(socket);
        expect(raw).not.toHaveBeenCalled();
        expect(sentOf(socket, "ask")[0]).toMatchObject({ agent: "billing", tool: "payInvoice", args: { iban: IBAN } });
        socket.reply({ type: "asked", askId, requestId: REQUEST });
        socket.reply({ type: "decided", askId, answer: "once" });

        expect(await out).toBe("paid 4950");
        expect(raw.mock.calls).toEqual([[{ iban: IBAN, amount: 4950 }]]);
        expect(decisionsOf(events).map((event) => [event.rule, event.decision, event.request])).toEqual([
            ["permission", "allow", undefined],
            ["approval", "ask", undefined],
            ["human", "allow", REQUEST],
        ]);
        expect(decisionsOf(events).every((event) => event.rules === rulesSnapshot().hash)).toBe(true);
    });

    it("refuses a call whose arguments changed after the approval, before the tool runs", async () => {
        const { socket } = linked();
        const raw = vi.fn(async (_input: object) => "paid");
        const payInvoice = guard(raw, [
            { type: "approval", name: "payInvoice" },
            { type: "limit", maxCallsPerDay: 5 },
        ]);
        const due = new Date(PAST);

        const out = payInvoice({ due });
        socket.reply({ type: "decided", askId: await nextAsk(socket), answer: "once", requestId: REQUEST });
        await vi.waitFor(() => expect(sentOf(socket, "count")).toHaveLength(1));
        due.setUTCFullYear(2030);
        socket.reply({ type: "counted", id: sentOf(socket, "count")[0]?.id as string, ok: true, used: [1] });

        const refused = await out;
        expect(isGuardRefusal(refused) && refused.reason).toBe("approval_required");
        expect(raw).not.toHaveBeenCalled();
        expect(decisionsOf(events).at(-1)).toMatchObject({ rule: "arguments-changed", decision: "block" });
        expect(sentOf(socket, "uncount").map(({ tool, counts }) => ({ tool, counts }))).toEqual([
            { tool: "payInvoice", counts: [{ counter: "calls", add: 1 }] },
        ]);
        expect(dayUsed(utcDay(), "payInvoice", "calls")).toBe(0);
    });

    it("refuses a denied call, and the tool never runs", async () => {
        const { socket } = linked();
        const raw = vi.fn(async (_input: object) => "paid");
        const payInvoice = guard(raw, { type: "approval", name: "payInvoice" });

        const out = payInvoice({ iban: IBAN });
        socket.reply({ type: "decided", askId: await nextAsk(socket), answer: "deny", requestId: REQUEST });

        const refused = await out;
        expect(isGuardRefusal(refused) && refused.reason).toBe("approval_denied");
        expect(raw).not.toHaveBeenCalled();
    });

    it("stops waiting after the approval guard's timeout, in seconds", async () => {
        const { socket } = linked();
        const payInvoice = guard(async (_input: object) => "paid", {
            type: "approval",
            name: "payInvoice",
            timeout: 0.05,
        });

        const refused = await payInvoice({ amount: 1 });

        expect(isGuardRefusal(refused) && refused.reason).toBe("approval_timed_out");
        expect(sentOf(socket, "cancel")).toHaveLength(1);
    });

    it("refuses when control stays out of reach", async () => {
        linked(false, { downMs: 50 });
        const payInvoice = guard(async (_input: object) => "paid", { type: "approval", name: "payInvoice" });

        const refused = await payInvoice({ amount: 1 });

        expect(isGuardRefusal(refused) && refused.reason).toBe("backend_unavailable");
    });

    it("refuses an approval timeout that is not a positive number of seconds", () => {
        for (const timeout of [0, -1, Number.NaN]) {
            expect(() => guard(async () => "x", { type: "approval", name: "pay", timeout })).toThrow(
                "An approval timeout must be a positive number of seconds",
            );
        }
    });
});

describe("per-day limits through control", () => {
    it("refuses a call control's count refuses, and gives the run its count back", async () => {
        const { socket } = linked();
        const raw = vi.fn(async (_input: object) => "sent");
        const sendEmail = guard(raw, { type: "limit", name: "sendEmail", maxCallsPerRun: 5, maxCallsPerDay: 10 });

        const out = runScope({}, () => sendEmail({ to: "a@acme.com" }));
        await vi.waitFor(() => expect(sentOf(socket, "count")).toHaveLength(1));
        const [count] = sentOf(socket, "count");
        socket.reply({ type: "counted", id: count?.id as string, ok: false, used: [10] });

        const refused = await out;
        expect(isGuardRefusal(refused) && refused.reason).toBe("daily_limit_reached");
        expect(count).toMatchObject({ tool: "sendEmail", counts: [{ counter: "calls", add: 1, max: 10 }] });
        expect(raw).not.toHaveBeenCalled();
    });

    it("blocks before asking when today's count from control is already at the cap", async () => {
        const ready = {
            ...READY,
            counters: [{ tool: "sendEmail", counter: "calls", day: new Date().toISOString().slice(0, 10), used: 3 }],
        };
        const { socket } = linked(ready);
        const sendEmail = guard(async (_input: object) => "sent", {
            type: "limit",
            name: "sendEmail",
            maxCallsPerDay: 3,
        });

        const refused = await sendEmail({ to: "a@acme.com" });

        expect(isGuardRefusal(refused) && refused.reason).toBe("daily_limit_reached");
        expect(sentOf(socket, "count")).toEqual([]);
    });
});

describe("the fleet check", () => {
    const quarantined = (until: string) => ({
        ...READY,
        quarantine: [{ key: "domain:evil-pay.com", observe: false }],
        fleetObserveUntil: until,
    });

    it("blocks a quarantined value from the synced list, and reports the blocked attempt", async () => {
        const { socket } = linked(quarantined(PAST));
        const raw = vi.fn(async (_input: object) => "paid");
        const pay = guard(raw, { type: "limit", name: "payInvoice", fleetCheck: ["url"] });

        const refused = await pay({ url: "https://pay.evil-pay.com/inv/1" });

        expect(isGuardRefusal(refused) && refused.reason).toBe("value_quarantined");
        expect(isGuardRefusal(refused) && refused.field).toBe("url");
        expect(raw).not.toHaveBeenCalled();
        expect(sentOf(socket, "fleet")).toMatchObject([{ blocked: true, values: [{ key: "domain:evil-pay.com" }] }]);
    });

    it("only records 'would block' during the fleet check's first days", async () => {
        const { socket } = linked(quarantined(FUTURE));
        const pay = guard(async (_input: object) => "paid", { type: "limit", name: "payInvoice", fleetCheck: ["url"] });

        const out = pay({ url: "https://evil-pay.com" });
        await vi.waitFor(() => expect(sentOf(socket, "fleet")).toHaveLength(1));
        const [use] = sentOf(socket, "fleet");
        socket.reply({ type: "fleet_result", id: use?.id as string, quarantined: [], fleetObserveUntil: FUTURE });

        expect(await out).toBe("paid");
        expect(use?.blocked).toBe(false);
        expect(decisionsOf(events).find((event) => event.rule === "fleet-check")).toMatchObject({
            decision: "block",
            mode: "observe",
            enforced: false,
        });
    });
});

describe("rules", () => {
    it("go to control when a guard registers after the link is up", () => {
        const { socket } = linked();

        guard(async () => "x", { type: "approval", name: "deleteFiles" });

        expect(sentOf(socket, "rules")).toEqual([{ type: "rules", rules: rulesSnapshot() }]);
    });
});
