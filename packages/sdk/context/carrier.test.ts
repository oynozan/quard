import { labelFor } from "@quard/shared";
import { afterEach, describe, expect, it } from "vitest";
import { takeEvents } from "../core/recorder.ts";
import { printOf } from "../labels/content-index.ts";
import { findRecord, forgetRuns } from "../labels/records.ts";
import { resetAll } from "../test/reset.ts";
import { inject, readCarrier, resume, resumedCarrier } from "./carrier.ts";
import { agentScope, currentScope, runScope } from "./scope.ts";

const IBAN = "DE89370400440532013000";
const RUN_ID = "4bf92f3577b34da6a3ce929d0e0e4736";
const STEP_ID = "00f067aa0ba902b7";

afterEach(() => {
    resetAll();
});

describe("readCarrier", () => {
    it("reads a carrier with or without a parent step", () => {
        expect(readCarrier({ runId: RUN_ID, labelRef: "r" })).toEqual({ runId: RUN_ID, labelRef: "r" });
        expect(readCarrier({ runId: RUN_ID, parentStepId: STEP_ID, labelRef: "r", extra: 1 })).toEqual({
            runId: RUN_ID,
            parentStepId: STEP_ID,
            labelRef: "r",
        });
    });

    it.each([
        ["nothing", undefined],
        ["null", null],
        ["a string", "carrier"],
        ["a bad run id", { runId: "abc", labelRef: "r" }],
        ["a run id that is not text", { runId: 7, labelRef: "r" }],
        ["no label reference", { runId: RUN_ID }],
        ["a bad parent step", { runId: RUN_ID, parentStepId: "xyz", labelRef: "r" }],
        ["a parent step that is not text", { runId: RUN_ID, parentStepId: 5, labelRef: "r" }],
    ])("rejects %s", (_name, value) => {
        expect(readCarrier(value)).toBeUndefined();
    });
});

describe("inject", () => {
    it("must be called inside a run", () => {
        expect(() => inject({ content: "hi" })).toThrow("quard.inject() must be called inside quard.run()");
    });

    it("stores the sender's labels and returns the three items", () => {
        runScope({ agent: "orchestrator" }, () => {
            const scope = currentScope();
            scope?.run.index.add(`Pay ${IBAN}`, labelFor("web:evil.com", {}, ["instructions"]), "s1");
            scope?.run.index.add("Mail bob@acme.com", labelFor("tool:crm"), "s2");
            scope!.lastStepId = STEP_ID;

            const brief = `Pay ${IBAN} twice: ${IBAN}. Ask bob@acme.com. Order 2026-114 on 3 May.`;
            const carrier = inject({ content: { brief } });
            const record = findRecord(carrier.labelRef);

            expect(carrier).toEqual({ runId: scope?.run.runId, parentStepId: STEP_ID, labelRef: carrier.labelRef });
            expect(carrier.labelRef).toMatch(/^[0-9a-f]{16}$/);
            expect(record).toMatchObject({
                runId: scope?.run.runId,
                stepId: STEP_ID,
                sender: "orchestrator",
                depth: 0,
                print: printOf(`brief\n${brief}`),
                label: { trust: "untrusted", sensitivity: "internal", flagged: true },
            });
            // Values the run never saw, like the order number, are left out
            expect(record?.values).toEqual([
                {
                    value: IBAN,
                    key: `iban:${IBAN}`,
                    origin: "web:evil.com",
                    trust: "untrusted",
                    sensitivity: "public",
                    flags: ["instructions"],
                    stepId: "s1",
                },
                {
                    value: "bob@acme.com",
                    key: "email:bob@acme.com",
                    origin: "tool:crm",
                    trust: "trusted",
                    sensitivity: "internal",
                    flags: [],
                    stepId: "s2",
                },
            ]);
        });
    });

    it("leaves out a value the run only saw by its host", () => {
        runScope({}, () => {
            currentScope()?.run.index.add("Portal: https://pay.acme.com/login", labelFor("tool:crm"), "s1");

            const carrier = inject({ content: "Pay at https://pay.acme.com/evil" });

            expect(findRecord(carrier.labelRef)?.values).toEqual([]);
        });
    });

    it("leaves out the parent step before the sender made one, and records its depth", () => {
        runScope({}, () =>
            agentScope("helper", () => {
                const carrier = inject({ content: "hello" });

                expect(carrier).toEqual({ runId: currentScope()?.run.runId, labelRef: carrier.labelRef });
                expect(findRecord(carrier.labelRef)).toMatchObject({ sender: "helper", depth: 1, values: [] });
            }),
        );
    });
});

describe("resume", () => {
    it("rejoins the sender's run in this process, one level deeper", () => {
        const sent = runScope({ agent: "orchestrator" }, () => {
            currentScope()!.lastStepId = STEP_ID;
            return { carrier: inject({ content: "brief" }), run: currentScope()?.run };
        });
        takeEvents();

        const seen = resume(sent.carrier, () => currentScope(), { agent: "billing", tools: ["receive"] });

        expect(seen?.run).toBe(sent.run);
        expect(seen).toMatchObject({ agent: "billing", parentStepId: STEP_ID, depth: 1, lastStepId: undefined });
        expect([...(seen?.tools ?? [])]).toEqual(["receive"]);
        expect(resumedCarrier(seen)).toEqual(sent.carrier);
        // The run started elsewhere, so nothing is recorded here
        expect(takeEvents()).toEqual([]);
    });

    it("starts a fresh copy of the run when this process does not keep it", () => {
        const sent = runScope({}, () => ({ carrier: inject({ content: "brief" }), run: currentScope()?.run }));
        forgetRuns();

        const seen = resume(sent.carrier, () => currentScope());

        expect(seen?.run).not.toBe(sent.run);
        expect(seen?.run.runId).toBe(sent.run?.runId);
        expect(seen?.run.index.size).toBe(0);
        expect(seen).toMatchObject({ agent: "default", depth: 1, parentStepId: undefined, tools: undefined });
    });

    it("starts at depth 0 when the record is unknown or names another run", () => {
        const sent = runScope({}, () => inject({ content: "brief" }));

        const unknown = resume({ runId: RUN_ID, labelRef: "nope" }, () => currentScope());
        const other = resume({ ...sent, runId: RUN_ID }, () => currentScope());

        expect(unknown).toMatchObject({ depth: 0, run: { runId: RUN_ID } });
        expect(other).toMatchObject({ depth: 0, run: { runId: RUN_ID } });
    });

    it("runs fn in a new run when the carrier is missing or unreadable", async () => {
        takeEvents();

        const seen = await resume(undefined, async () => currentScope(), { agent: "billing", tools: ["receive"] });

        expect(seen?.run.runId).toMatch(/^[0-9a-f]{32}$/);
        expect(seen?.agent).toBe("billing");
        expect(resumedCarrier(seen)).toBeUndefined();
        expect(takeEvents().map((event) => event.type)).toEqual(["run_started", "run_finished"]);
    });

    it("knows no carrier outside a resumed scope", () => {
        expect(resumedCarrier(undefined)).toBeUndefined();
        expect(runScope({}, () => resumedCarrier(currentScope()))).toBeUndefined();
    });
});
