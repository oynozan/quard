// @vitest-environment node
import { describe, expect, it } from "vitest";
import { runDetailOf } from "../../runs/live/detail";
import { RUN, T2, at, storedRun } from "../../../../../test/runs-fixture";
import { HASH, REQUEST, openItem, waiter } from "../../../../../test/approvals-overview/items";
import { detailOf, requestOf } from "./detail";

const now = at(30).getTime();
const OTHER_RUN = "e".repeat(32);

describe("requestOf", () => {
    it("shows who asks, with the full values and their origins, and that a call still waits", () => {
        expect(requestOf(openItem(), now)).toEqual({
            id: REQUEST,
            runId: RUN,
            stepId: T2,
            agent: "billing",
            tool: "payInvoice",
            args: [
                {
                    name: "iban",
                    value: "GB33 BUKB 2020 1555 5555",
                    origins: [{ origin: "web:acme-billing.net", trust: "untrusted", sensitivity: "public" }],
                    traced: true,
                },
                { name: "amount", value: "4950", origins: [], traced: false },
                { name: "memo", value: "Invoice 114", origins: [], traced: false },
            ],
            reason: "payInvoice asks a human first",
            openedAt: at(6).getTime(),
            waiting: true,
        });
    });

    it("says no call waits once the beats stopped", () => {
        expect(requestOf(openItem(), at(120).getTime()).waiting).toBe(false);
    });
});

describe("detailOf", () => {
    it("adds the masks, the heartbeat, the joined calls and the hash, and the path and checks from the run", () => {
        const item = openItem({ waiters: [waiter(), waiter({ askId: "b".repeat(16), runId: OTHER_RUN })] });
        const detail = detailOf(item, runDetailOf(storedRun(), now), now);
        expect(detail.request).toEqual(requestOf(item, now));
        expect(detail.args.map((arg) => [arg.name, arg.value, arg.masked])).toEqual([
            ["iban", "GB33 BUKB 2020 1555 5555", "GB33…5555"],
            ["amount", "4950", "4950"],
            ["memo", "Invoice 114", "Invoice 114"],
        ]);
        expect(detail.heartbeat).toEqual({ state: "live", lastAt: at(20).getTime() });
        expect(detail.joined.map((call) => call.runId)).toEqual([OTHER_RUN]);
        expect(detail.argsHash).toBe(HASH);
        expect(detail.path.at(-1)).toMatchObject({ kind: "call", title: "payInvoice" });
        expect(detail.decisions.map((check) => check.rule)).toContain("approval");
    });

    it("has no path and no checks until the run arrives", () => {
        const detail = detailOf(openItem(), null, now);
        expect(detail.path).toEqual([]);
        expect(detail.decisions).toEqual([]);
    });
});
