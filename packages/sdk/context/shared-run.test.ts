import { parseHashKey } from "@quard/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isShared } from "../guards/limit/run-counts.ts";
import { fakeSockets, sentOf, type FakeSocket } from "../test/fake-socket.ts";
import { resetAll } from "../test/reset.ts";
import { setActiveControl } from "../transport/link/active.ts";
import { createControl, type Control } from "../transport/link/control.ts";
import { newRun } from "./run.ts";
import { startSharing } from "./shared-run.ts";

let control: Control | undefined;

function linked() {
    const fake = fakeSockets();
    control = createControl({ url: "ws://c", key: "k", hashKey: parseHashKey("ab".repeat(32)), open: fake.open });
    setActiveControl(control);
    return fake;
}

const runCounts = (socket: FakeSocket) =>
    sentOf(socket, "run_count").map(({ runId, counter, add, max }) => ({ runId, counter, add, max }));

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    control?.stop();
    control = undefined;
    resetAll();
    vi.useRealTimers();
});

describe("startSharing", () => {
    it("sends the run's totals once, so control starts from them", () => {
        const socket = linked().connect();
        const run = newRun();
        run.modelCalls = 3;
        run.costUsd = 0.75;
        run.counters.set("calls:payInvoice", 2);

        startSharing(run);
        startSharing(run);

        expect(isShared(run)).toBe(true);
        expect(runCounts(socket)).toEqual([
            { runId: run.runId, counter: "steps", add: 3, max: undefined },
            { runId: run.runId, counter: "cost", add: 0.75, max: undefined },
            { runId: run.runId, counter: "calls:payInvoice", add: 2, max: undefined },
        ]);
    });

    it("sends nothing for a run that counted nothing yet", () => {
        const socket = linked().connect();
        const run = newRun();

        startSharing(run);

        expect(isShared(run)).toBe(true);
        expect(runCounts(socket)).toEqual([]);
    });

    it("keeps the totals while control is away, and sends them once it is back", () => {
        const fake = linked();
        const run = newRun();
        run.modelCalls = 1;

        startSharing(run);

        expect(runCounts(fake.connect())).toEqual([{ runId: run.runId, counter: "steps", add: 1, max: undefined }]);
    });

    it("leaves the run counting here without control, until a later call finds control", () => {
        const run = newRun();
        run.modelCalls = 2;

        startSharing(run);
        expect(isShared(run)).toBe(false);

        const socket = linked().connect();
        startSharing(run);
        expect(isShared(run)).toBe(true);
        expect(runCounts(socket).map((count) => count.add)).toEqual([2]);
    });

    it("leaves a run whose id control can't take counting here", () => {
        linked().connect();
        const run = newRun("my-run");

        startSharing(run);

        expect(isShared(run)).toBe(false);
    });
});
