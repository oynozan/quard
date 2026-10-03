import { parseHashKey } from "@quard/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dayUsed, utcDay } from "../../guards/limit/daily.ts";
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
