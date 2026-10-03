import { parseHashKey } from "@quard/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configure } from "../../core/config.ts";
import type { FailResult } from "../../guards/call.ts";
import { makeAskableCall } from "../../test/call.ts";
import { fakeSockets, sentOf } from "../../test/fake-socket.ts";
import { resetAll } from "../../test/reset.ts";
import { setActiveControl } from "../../transport/link/active.ts";
import { createControl } from "../../transport/link/control.ts";
import { askHuman } from "./human.ts";
import { timeoutMs } from "./record.ts";

const ASKS: FailResult[] = [
    { guard: "approval", rule: "approval", decision: "ask", mode: "block", reason: "approval_required" },
];

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    resetAll();
    vi.useRealTimers();
});

describe("askHuman", () => {
    it("blocks when there is no approver and no control link", async () => {
        expect(await askHuman(makeAskableCall({}), ASKS, undefined)).toMatchObject({
            rule: "no-approver",
            reason: "approval_unavailable",
        });
    });

    it("asks the approver set in code before the dashboard", async () => {
        const fake = fakeSockets();
        const control = createControl({
            url: "ws://c",
            key: "k",
            hashKey: parseHashKey("ab".repeat(32)),
            open: fake.open,
        });
        setActiveControl(control);
        const socket = fake.connect();
        configure({ approver: async () => "once" });

        expect(await askHuman(makeAskableCall({}), ASKS, undefined)).toBe("approved");
        expect(sentOf(socket, "ask")).toEqual([]);

        configure({ approver: undefined });
        const asked = askHuman(makeAskableCall({}), ASKS, 2);
        expect(sentOf(socket, "ask")).toHaveLength(1);
        vi.advanceTimersByTime(2000);
        expect(await asked).toMatchObject({ reason: "approval_timed_out" });
        control.stop();
    });

    it("stops an approver in code that takes longer than the timeout", async () => {
        configure({ approver: () => new Promise(() => {}) });

        const asked = askHuman(makeAskableCall({}), ASKS, 1);
        vi.advanceTimersByTime(1000);

        expect(await asked).toMatchObject({ rule: "timeout", reason: "approval_timed_out" });
    });

    it("still takes an approver's answer within the timeout", async () => {
        configure({ approver: async () => "deny" });

        expect(await askHuman(makeAskableCall({}), ASKS, 60)).toMatchObject({ reason: "approval_denied" });
    });
});

describe("timeoutMs", () => {
    it("turns seconds into a wait setTimeout can make", () => {
        expect(timeoutMs(undefined)).toBeUndefined();
        expect(timeoutMs(1.5)).toBe(1500);
        expect(timeoutMs(Number.POSITIVE_INFINITY)).toBe(2_147_483_647);
    });
});
