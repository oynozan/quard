// @vitest-environment node
import { describe, expect, it } from "vitest";
import { RUN, T2, at } from "../../../../../test/runs-fixture";
import { openItem, waiter } from "../../../../../test/approvals-overview/items";
import { heartbeatOf, joinedOf } from "./heartbeat";

const OTHER_RUN = "e".repeat(32);
const now = at(30).getTime();

describe("heartbeatOf", () => {
    it("is live while a waiting call beat within the last 45 seconds, at its newest beat", () => {
        const item = openItem({
            waiters: [waiter({ lastBeatAt: at(10) }), waiter({ askId: "b".repeat(16), lastBeatAt: at(25) })],
        });
        expect(heartbeatOf(item, now)).toEqual({ state: "live", lastAt: at(25).getTime() });
        expect(heartbeatOf(openItem({ waiters: [waiter({ lastBeatAt: at(-15) })] }), now).state).toBe("live");
    });

    it("stops when the beats are older than 45 seconds, at the last one", () => {
        const item = openItem({ waiters: [waiter({ lastBeatAt: at(-16) })] });
        expect(heartbeatOf(item, now)).toEqual({ state: "stopped", lastAt: at(6).getTime() });
        expect(heartbeatOf(openItem({ waiters: [waiter({ lastBeatAt: at(8) })] }), at(60).getTime())).toEqual({
            state: "stopped",
            lastAt: at(8).getTime(),
        });
    });

    it("stops when every call is done waiting, at the time the last one stopped", () => {
        const item = openItem({ waiters: [waiter({ lastBeatAt: at(20), doneAt: at(22) })] });
        expect(heartbeatOf(item, now)).toEqual({ state: "stopped", lastAt: at(22).getTime() });
    });

    it("counts from the time the request opened when no call waits on it", () => {
        expect(heartbeatOf(openItem({ waiters: [] }), now)).toEqual({ state: "stopped", lastAt: at(6).getTime() });
    });
});

describe("joinedOf", () => {
    it("lists the other live calls, oldest first, but not the call that asked first", () => {
        const item = openItem({
            waiters: [
                waiter(),
                waiter({ askId: "b".repeat(16), runId: OTHER_RUN, since: at(12) }),
                waiter({ askId: "c".repeat(16), stepId: "9".repeat(16), since: at(14) }),
            ],
        });
        expect(joinedOf(item, now)).toEqual([
            { runId: OTHER_RUN, stepId: T2, agent: "billing", since: at(12).getTime() },
            { runId: RUN, stepId: "9".repeat(16), agent: "billing", since: at(14).getTime() },
        ]);
    });

    it("leaves out calls that are done or went quiet", () => {
        const item = openItem({
            waiters: [
                waiter({ askId: "b".repeat(16), runId: OTHER_RUN, doneAt: at(20) }),
                waiter({ askId: "c".repeat(16), runId: OTHER_RUN, lastBeatAt: at(-20) }),
            ],
        });
        expect(joinedOf(item, now)).toEqual([]);
    });
});
