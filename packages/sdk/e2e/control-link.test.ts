import { createServer } from "node:net";
import { parseHashKey, type RunEvent } from "@quard/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guard, isGuardRefusal, quard } from "../index.ts";
import { CONTROL_KEY, startControlServer, type ControlServer } from "../test/control-server.ts";
import { resetAll } from "../test/reset.ts";
import { activeControl, setActiveControl } from "../transport/link/active.ts";
import { createControl, type Control } from "../transport/link/control.ts";
import { controlSocketUrl } from "../transport/link/url.ts";

// The SDK against a stand-in for control over a real WebSocket

const HASH_KEY = "ab".repeat(32);
const IBAN = "DE89370400440532013000";

let server: ControlServer;
let control: Control | undefined;
let events: RunEvent[] = [];

beforeEach(async () => {
    server = await startControlServer();
    events = [];
});

afterEach(async () => {
    control?.stop();
    control = undefined;
    resetAll();
    await server.close();
});

function connect(): void {
    quard.configure({ key: CONTROL_KEY, controlUrl: server.url, hashKey: HASH_KEY, onEvent: (e) => events.push(e) });
}

// A link with short waits, for the tests that drop the connection
function connectFast(url = controlSocketUrl(server.url), downMs = 3000): void {
    control = createControl({
        url,
        key: CONTROL_KEY,
        hashKey: parseHashKey(HASH_KEY),
        timing: { firstDelay: 20, maxDelay: 50, downMs },
    });
    setActiveControl(control);
}

async function linkReady(): Promise<void> {
    await vi.waitFor(() => expect(activeControl()?.link.ready()).toBe(true));
}

describe("approvals in the dashboard", () => {
    it("pause payInvoice until a human approves, then run it with exactly the approved arguments", async () => {
        connect();
        const rawPay = vi.fn(
            async (input: { iban: string; amount: number }) => `paid ${input.amount} to ${input.iban}`,
        );
        const payInvoice = guard(rawPay, { type: "approval", name: "payInvoice" });

        const out = quard.run({ agent: "billing" }, () => payInvoice({ iban: IBAN, amount: 4950 }));
        const ask = await server.waitFor("ask");
        expect(rawPay).not.toHaveBeenCalled();
        server.decide(ask.askId, "once", `apr_${ask.askId}`);

        expect(await out).toBe(`paid 4950 to ${IBAN}`);
        expect(rawPay.mock.calls).toEqual([[{ iban: IBAN, amount: 4950 }]]);
        expect(ask).toMatchObject({ agent: "billing", tool: "payInvoice", args: { iban: IBAN, amount: 4950 } });
        const hello = await server.waitFor("hello");
        expect(hello.rules.list).toContainEqual({
            tool: "payInvoice",
            guard: "approval",
            rule: "approval",
            mode: "block",
        });
        const approved = events.find((event) => event.type === "decision" && event.rule === "human");
        expect(approved).toMatchObject({ decision: "allow", request: `apr_${ask.askId}`, rules: hello.rules.hash });
    });

    it("refuse a denied call, and the tool never runs", async () => {
        connect();
        server.state.autoAnswer = "deny";
        const rawPay = vi.fn(async (_input: object) => "paid");

        const refused = await guard(rawPay, { type: "approval", name: "payInvoice" })({ iban: IBAN });

        expect(isGuardRefusal(refused) && refused.reason).toBe("approval_denied");
        expect(rawPay).not.toHaveBeenCalled();
    });

    it("resume a waiting call after the connection drops, with the same ask and request", async () => {
        connectFast();
        const payInvoice = guard(async (input: { amount: number }) => `paid ${input.amount}`, {
            type: "approval",
            name: "payInvoice",
        });

        const out = payInvoice({ amount: 120 });
        const first = await server.waitFor("ask");
        await vi.waitFor(() => expect(server.connections()).toHaveLength(1));
        server.dropAll();
        const again = await server.waitFor("ask", (ask) => ask.requestId !== undefined);
        server.decide(again.askId, "once");

        expect(await out).toBe("paid 120");
        expect(again.askId).toBe(first.askId);
        expect(again.requestId).toBe(`apr_${first.askId}`);
    });

    it("refuse with backend_unavailable when control can't be reached in time", async () => {
        const closed = createServer();
        await new Promise<void>((resolve) => closed.listen(0, "127.0.0.1", resolve));
        const address = closed.address();
        const port = typeof address === "object" && address !== null ? address.port : 0;
        await new Promise((resolve) => closed.close(resolve));
        connectFast(`ws://127.0.0.1:${port}/v1/connect`, 200);
        const payInvoice = guard(async (_input: object) => "paid", { type: "approval", name: "payInvoice" });

        const refused = await payInvoice({ amount: 1 });

        expect(isGuardRefusal(refused) && refused.reason).toBe("backend_unavailable");
    });
});

describe("per-day limits and the fleet check", () => {
    it("share one per-day count through control", async () => {
        connect();
        const rawSend = vi.fn(async (_input: object) => "sent");
        const sendEmail = guard(rawSend, { type: "limit", name: "sendEmail", maxCallsPerDay: 1 });
        await linkReady();

        expect(await sendEmail({ to: "a@acme.com" })).toBe("sent");
        const refused = await sendEmail({ to: "b@acme.com" });

        expect(isGuardRefusal(refused) && refused.reason).toBe("daily_limit_reached");
        expect(rawSend).toHaveBeenCalledTimes(1);
        expect([...server.counters.values()]).toEqual([1]);
    });

    it("send counts made before the link was up once it is", async () => {
        connect();
        const sendEmail = guard(async (_input: object) => "sent", {
            type: "limit",
            name: "sendEmail",
            maxCallsPerDay: 5,
        });

        expect(await sendEmail({ to: "a@acme.com" })).toBe("sent");
        const count = await server.waitFor("count");

        expect(count).toMatchObject({ tool: "sendEmail", counter: "calls", add: 1 });
        expect(count.max).toBeUndefined();
    });

    it("block a value control quarantines, and report the blocked attempt", async () => {
        server.state.ready = { ...server.state.ready, fleetObserveUntil: "2026-01-01T00:00:00.000Z" };
        connect();
        const rawPay = vi.fn(async (_input: object) => "paid");
        const payInvoice = guard(rawPay, { type: "limit", name: "payInvoice", fleetCheck: ["url"] });
        await linkReady();

        server.push({ type: "quarantine", add: [{ key: "domain:evil-pay.com", observe: false }], remove: [] });
        await vi.waitFor(() => expect(activeControl()?.fleet.entry("domain:evil-pay.com", Date.now())).toBeDefined());
        const refused = await payInvoice({ url: "https://evil-pay.com/inv/7" });

        expect(isGuardRefusal(refused) && refused.reason).toBe("value_quarantined");

        const report = await server.waitFor("fleet", (fleet) => fleet.blocked);
        expect(report.values).toEqual([{ field: "url", kind: "domain", key: "domain:evil-pay.com" }]);
        expect(rawPay).not.toHaveBeenCalled();
    });
});
