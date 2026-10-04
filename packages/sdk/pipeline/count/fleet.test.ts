import { keyedHash } from "@quard/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forgetProjectKey, learnProjectKey } from "../../core/project-key.ts";
import { takeEvents } from "../../core/recorder.ts";
import type { RuleResult } from "../../guards/call.ts";
import type { LimitOptions } from "../../guards/options.ts";
import { makeAskableCall } from "../../test/call.ts";
import { decisionsOf } from "../../test/events.ts";
import { fakeSockets, sentOf } from "../../test/fake-socket.ts";
import { PROJECT_KEY, PROJECT_KEY_TEXT } from "../../test/hash-key.ts";
import { resetAll } from "../../test/reset.ts";
import { setActiveControl } from "../../transport/link/active.ts";
import { createControl, type Control } from "../../transport/link/control.ts";
import { reportRefused, reportUse } from "./fleet.ts";

const WATCH: LimitOptions = { type: "limit", fleetCheck: ["url"] };
const INPUT = { url: "https://evil-pay.com/pay" };
const KEY = "domain:evil-pay.com";
// 120 different main domains in one field
const HOSTS = Array.from({ length: 120 }, (_, n) => `https://site${n}.com`).join(" ");
const FLAGGED: RuleResult = {
    guard: "limit",
    rule: "fleet-check",
    decision: "block",
    mode: "observe",
    reason: "value_quarantined",
    field: "url",
};

let control: Control | undefined;

function setup() {
    const fake = fakeSockets();
    control = createControl({ url: "ws://c", key: "k", open: fake.open });
    return { fake, control };
}

const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
    vi.useFakeTimers({ now: Date.parse("2026-10-03T12:00:00.000Z") });
});

afterEach(() => {
    control?.stop();
    control = undefined;
    resetAll();
    vi.useRealTimers();
});

// Reports a use and answers it with the given quarantine
async function reported(quarantined: object[], until: string | null, options = WATCH, checked: RuleResult[] = []) {
    const { fake, control } = setup();
    const socket = fake.connect();
    const result = reportUse(makeAskableCall(INPUT), options, control, checked);
    const [use] = sentOf(socket, "fleet");
    socket.reply({ type: "fleet_result", id: use?.id, quarantined, fleetObserveUntil: until } as never);
    return { use, result: await result, decisions: decisionsOf(takeEvents()) };
}

describe("reportUse", () => {
    it("does nothing without a fleet check, a link or watched values", async () => {
        const { control } = setup();

        expect(await reportUse(makeAskableCall(INPUT), { type: "limit" }, control, [])).toBeUndefined();
        expect(await reportUse(makeAskableCall(INPUT), WATCH, undefined, [])).toBeUndefined();
        expect(await reportUse(makeAskableCall({ url: "none" }), WATCH, control, [])).toBeUndefined();
    });

    it("reports the call's values and lets it run when none is quarantined", async () => {
        const { use, result, decisions } = await reported([], null);

        expect(use).toMatchObject({ blocked: false, agent: "billing", tool: "payInvoice", values: [{ key: KEY }] });
        expect(result).toBeUndefined();
        expect(decisions).toEqual([]);
    });

    it("refuses a value control quarantined since the check before", async () => {
        const { result, decisions } = await reported([{ key: KEY, observe: false }], "2026-10-01T00:00:00.000Z");

        expect(result).toMatchObject({ rule: "fleet-check", mode: "block", reason: "value_quarantined", field: "url" });
        expect(decisions).toMatchObject([{ rule: "fleet-check", decision: "block", enforced: true }]);
    });

    it("only records 'would block' while the fleet check observes, once", async () => {
        const early = await reported([{ key: KEY, observe: false }], "2026-10-09T00:00:00.000Z");
        const again = await reported([{ key: KEY, observe: true }], null, WATCH, [FLAGGED]);

        expect([early.result, again.result]).toEqual([undefined, undefined]);
        expect(early.decisions).toMatchObject([{ mode: "observe", enforced: false }]);
        expect(again.decisions).toEqual([]);
    });

    it("refuses on an enforced value listed after one that only observes", async () => {
        const { fake, control } = setup();
        const socket = fake.connect();

        const result = reportUse(
            makeAskableCall({ url: "https://watch.com https://evil-pay.com" }),
            WATCH,
            control,
            [],
        );
        const [use] = sentOf(socket, "fleet");
        const quarantined = [
            { key: "domain:watch.com", observe: true },
            { key: KEY, observe: false },
        ];
        socket.reply({ type: "fleet_result", id: use?.id as string, quarantined, fleetObserveUntil: null });

        expect(await result).toMatchObject({ mode: "block", reason: "value_quarantined" });
    });

    it("sends reports of at most 100 values, and refuses a value from any of them", async () => {
        const { fake, control } = setup();
        const socket = fake.connect();

        const result = reportUse(makeAskableCall({ url: HOSTS }), WATCH, control, []);
        const [first, second] = sentOf(socket, "fleet");
        const watched = [{ key: "domain:site0.com", observe: true }];
        socket.reply({ type: "fleet_result", id: first?.id as string, quarantined: watched, fleetObserveUntil: null });
        const enforced = [{ key: "domain:site110.com", observe: false }];
        socket.reply({
            type: "fleet_result",
            id: second?.id as string,
            quarantined: enforced,
            fleetObserveUntil: null,
        });

        expect([first?.values.length, second?.values.length]).toEqual([100, 20]);
        expect(await result).toMatchObject({ mode: "block", reason: "value_quarantined" });
    });

    it("keeps the report while control is away, and sends it once it is back", async () => {
        const { fake, control } = setup();

        await reportUse(makeAskableCall(INPUT), WATCH, control, []);

        expect(sentOf(fake.connect(), "fleet")).toMatchObject([{ blocked: false, values: [{ key: KEY }] }]);
    });

    it("keeps the report when control is slow, until a late answer shows control has it", async () => {
        const { fake, control } = setup();
        const socket = fake.connect();

        const result = reportUse(makeAskableCall(INPUT), WATCH, control, []);
        vi.advanceTimersByTime(5000);
        expect(await result).toBeUndefined();
        const [use] = sentOf(socket, "fleet");
        socket.reply({ type: "fleet_result", id: use?.id as string, quarantined: [], fleetObserveUntil: null });

        socket.drop();
        vi.advanceTimersByTime(1000);
        expect(sentOf(fake.connect(), "fleet")).toEqual([]);
    });

    it("keeps the report when the link drops before control answers", async () => {
        const { fake, control } = setup();
        const socket = fake.connect();

        const result = reportUse(makeAskableCall(INPUT), WATCH, control, []);
        vi.advanceTimersByTime(5000);
        await result;
        socket.drop();
        await settle();
        vi.advanceTimersByTime(1000);

        expect(sentOf(fake.connect(), "fleet")).toHaveLength(1);
    });
});

describe("reportUse with IBANs", () => {
    const IBAN = "DE89370400440532013000";
    const IBAN_KEY = `iban:DE89…3000#${keyedHash(PROJECT_KEY, "iban", IBAN)}`;
    const PAYEE: LimitOptions = { type: "limit", fleetCheck: ["iban"] };

    it("reports them hashed with the project's key, and refuses one control quarantined", async () => {
        const { fake, control } = setup();
        const socket = fake.connect();

        const result = reportUse(makeAskableCall({ iban: IBAN }), PAYEE, control, []);
        const [use] = sentOf(socket, "fleet");
        const quarantined = [{ key: IBAN_KEY, observe: false }];
        socket.reply({ type: "fleet_result", id: use?.id as string, quarantined, fleetObserveUntil: null });

        expect(use?.values).toEqual([{ field: "iban", kind: "iban", key: IBAN_KEY }]);
        expect(await result).toMatchObject({ mode: "block", reason: "value_quarantined", field: "iban" });
    });

    it("keeps the report while the project's key is unknown, and sends it once it is known", async () => {
        const { fake, control } = setup();
        const socket = fake.connect();
        forgetProjectKey();

        expect(await reportUse(makeAskableCall({ iban: IBAN }), PAYEE, control, [])).toBeUndefined();
        expect(sentOf(socket, "fleet")).toEqual([]);
        learnProjectKey(PROJECT_KEY_TEXT);
        vi.advanceTimersByTime(30_000);

        expect(sentOf(socket, "fleet")).toMatchObject([{ values: [{ key: IBAN_KEY }] }]);
    });
});

describe("reportRefused", () => {
    it("reports the watched values of a refused call as blocked", () => {
        const { fake, control } = setup();
        setActiveControl(control);
        const socket = fake.connect();

        reportRefused(makeAskableCall(INPUT), [{ type: "approval" }, WATCH, { ...WATCH, fleetCheck: ["url", "to"] }]);

        expect(sentOf(socket, "fleet")).toMatchObject([{ blocked: true, values: [{ field: "url", key: KEY }] }]);
    });

    it("reports a refused call's values in reports of at most 100", () => {
        const { fake, control } = setup();
        setActiveControl(control);
        const socket = fake.connect();

        reportRefused(makeAskableCall({ url: HOSTS }), [WATCH]);

        expect(sentOf(socket, "fleet").map((use) => [use.blocked, use.values.length])).toEqual([
            [true, 100],
            [true, 20],
        ]);
    });

    it("reports nothing without a link, watched fields or values", () => {
        const { fake, control } = setup();
        const socket = fake.connect();

        reportRefused(makeAskableCall(INPUT), [WATCH]);
        setActiveControl(control);
        reportRefused(makeAskableCall(INPUT), [{ type: "limit" }]);
        reportRefused(makeAskableCall({ url: "nothing to watch" }), [WATCH]);

        expect(sentOf(socket, "fleet")).toEqual([]);
    });
});
