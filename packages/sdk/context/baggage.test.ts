import { describe, expect, it } from "vitest";
import { readBaggage, toBaggage } from "./baggage.ts";

const RUN_ID = "4bf92f3577b34da6a3ce929d0e0e4736";
const STEP_ID = "00f067aa0ba902b7";
const REF = "0123456789abcdef";

describe("toBaggage", () => {
    it("writes the three items as baggage members", () => {
        expect(toBaggage({ runId: RUN_ID, parentStepId: STEP_ID, labelRef: REF })).toBe(
            `quard-run=${RUN_ID},quard-parent=${STEP_ID},quard-labels=${REF}`,
        );
        expect(toBaggage({ runId: RUN_ID, labelRef: "a b" })).toBe(`quard-run=${RUN_ID},quard-labels=a%20b`);
    });
});

describe("readBaggage", () => {
    it("reads the three items back", () => {
        const carrier = { runId: RUN_ID, parentStepId: STEP_ID, labelRef: REF };

        expect(readBaggage(toBaggage(carrier))).toEqual(carrier);
    });

    it("skips other members, properties, spaces and repeats", () => {
        const header = `userId=alice, quard-run = ${RUN_ID};ttl=5 ,quard-labels=a%20b,quard-run=${"0".repeat(32)},odd`;

        expect(readBaggage(header)).toEqual({ runId: RUN_ID, labelRef: "a b" });
    });

    it("leaves out a value that is not percent-encoded right", () => {
        expect(readBaggage(`quard-run=${RUN_ID},quard-labels=%E0%A4%A`)).toEqual({ runId: RUN_ID });
    });
});
