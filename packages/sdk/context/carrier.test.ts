import { keyedHash, labelFor, parseHashKey, type LabelRecord } from "@quard/shared";
import { afterEach, describe, expect, it } from "vitest";
import { takeEvents } from "../core/recorder.ts";
import { printOf } from "../labels/print.ts";
import { clearRecords, findRecord, forgetRuns } from "../labels/records.ts";
import { resetAll } from "../test/reset.ts";
import { startWebhookServer, WEBHOOK_KEY } from "../test/webhook-server.ts";
import { configureQuard } from "../transport/configure.ts";
import { toBaggage } from "./baggage.ts";
import { incomingMessage, inject, readCarrier, resume } from "./carrier.ts";
import { agentScope, currentScope, runScope } from "./scope.ts";

const IBAN = "DE89370400440532013000";
const RUN_ID = "4bf92f3577b34da6a3ce929d0e0e4736";
const STEP_ID = "00f067aa0ba902b7";
const HASH_KEY = "ab".repeat(32);

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

    it("reads a carrier from a W3C baggage header", () => {
        const carrier = { runId: RUN_ID, parentStepId: STEP_ID, labelRef: "0123456789abcdef" };

        expect(readCarrier(`other=1,${toBaggage(carrier)}`)).toEqual(carrier);
        expect(readCarrier("other=1")).toBeUndefined();
    });

    it.each([
        ["nothing", undefined],
        ["null", null],
        ["a number", 7],
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
    it("must be called inside a run", async () => {
        await expect(inject({ content: "hi" })).rejects.toThrow("quard.inject() must be called inside quard.run()");
    });

    it("stores the sender's labels and returns the three items", async () => {
        await runScope({ agent: "orchestrator" }, async () => {
            const scope = currentScope();
            scope?.run.index.add(`Pay ${IBAN}`, labelFor("web:evil.com", {}, ["instructions"]), "s1");
            scope?.run.index.add("Mail bob@acme.com", labelFor("tool:crm"), "s2");
            scope!.lastStepId = STEP_ID;

            const brief = `Pay ${IBAN} twice: ${IBAN}. Ask bob@acme.com. Order 2026-114 on 3 May.`;
            const carrier = await inject({ content: { brief } });
            const found = await findRecord(carrier.labelRef);

            expect(carrier).toEqual({ runId: scope?.run.runId, parentStepId: STEP_ID, labelRef: carrier.labelRef });
            expect(carrier.labelRef).toMatch(/^[0-9a-f]{16}$/);
            expect(found?.record).toEqual({
                kind: "message",
                ref: carrier.labelRef,
                runId: scope?.run.runId,
                stepId: STEP_ID,
                sender: "orchestrator",
                depth: 0,
                print: printOf({ brief }),
                label: {
                    trust: "untrusted",
                    sensitivity: "internal",
                    origins: ["web:evil.com", "tool:crm"],
                    flagged: true,
                },
                // No hash key, so no value leaves the process
                values: [],
            });
            // Values the run never saw, like the order number, are left out
            expect(found?.values).toEqual([
                {
                    type: "iban",
                    value: IBAN,
                    key: `iban:${IBAN}`,
                    origin: "web:evil.com",
                    trust: "untrusted",
                    sensitivity: "public",
                    flags: ["instructions"],
                    stepId: "s1",
                },
                {
                    type: "email",
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

    it("labels the message unknown content when the sender read nothing", async () => {
        const carrier = await runScope({}, () => inject({ content: `Pay ${IBAN}` }));

        expect((await findRecord(carrier.labelRef))?.record.label).toEqual({
            trust: "untrusted",
            sensitivity: "internal",
            origins: ["unknown"],
            flagged: false,
        });
    });

    it("leaves out a value the run only saw by its host", async () => {
        await runScope({}, async () => {
            currentScope()?.run.index.add("Portal: https://pay.acme.com/login", labelFor("tool:crm"), "s1");

            const carrier = await inject({ content: "Pay at https://pay.acme.com/evil" });

            expect((await findRecord(carrier.labelRef))?.values).toEqual([]);
        });
    });

    it("leaves out values under fields named like secrets", async () => {
        await runScope({}, async () => {
            currentScope()?.run.index.add(`Pay ${IBAN}`, labelFor("web:evil.com"), "s1");

            const carrier = await inject({ content: { note: "hello", password: IBAN } });

            expect((await findRecord(carrier.labelRef))?.values).toEqual([]);
        });
    });

    it("leaves out the parent step before the sender made one, and records its depth and tools", async () => {
        await runScope({ tools: ["send", "delegate"] }, () =>
            agentScope("helper", async () => {
                const carrier = await inject({ content: "hello" });

                expect(carrier).toEqual({ runId: currentScope()?.run.runId, labelRef: carrier.labelRef });
                expect((await findRecord(carrier.labelRef))?.record).toMatchObject({
                    sender: "helper",
                    depth: 1,
                    values: [],
                    tools: ["delegate", "send"],
                });
            }),
        );
    });

    it("stores the record in webhook before it returns, its values hashed", async () => {
        const labels: LabelRecord[] = [];
        const webhook = await startWebhookServer(labels);
        configureQuard({ key: WEBHOOK_KEY, webhookUrl: webhook.url, hashKey: HASH_KEY });

        const carrier = await runScope({}, async () => {
            currentScope()?.run.index.add(`Bank: ${IBAN}`, labelFor("web:evil.com"), STEP_ID);
            return inject({ content: `Pay ${IBAN}` });
        });

        expect(labels).toMatchObject([
            {
                kind: "message",
                ref: carrier.labelRef,
                values: [{ hash: keyedHash(parseHashKey(HASH_KEY), "iban", IBAN) }],
            },
        ]);
        expect(takeEvents().filter((event) => event.type === "warning")).toEqual([]);
        await webhook.close();
    });

    it("still returns the carrier when the record could not be stored, and records a warning", async () => {
        const webhook = await startWebhookServer();
        webhook.state.labelStatus = 503;
        configureQuard({ key: WEBHOOK_KEY, webhookUrl: webhook.url, hashKey: HASH_KEY });

        const carrier = await runScope({ agent: "orchestrator" }, () => inject({ content: "brief" }));

        expect(carrier.runId).toMatch(/^[0-9a-f]{32}$/);
        expect(takeEvents().find((event) => event.type === "warning")).toMatchObject({
            runId: carrier.runId,
            stepId: expect.stringMatching(/^[0-9a-f]{16}$/),
            agent: "orchestrator",
            code: "label_record_not_stored",
        });
        await webhook.close();
    });
});

describe("resume", () => {
    it("rejoins the sender's run in this process, one level deeper", async () => {
        const sent = await runScope({ agent: "orchestrator" }, async () => {
            currentScope()!.lastStepId = STEP_ID;
            return { carrier: await inject({ content: "brief" }), run: currentScope()?.run };
        });
        takeEvents();

        const seen = await resume(sent.carrier, () => currentScope(), { agent: "billing", tools: ["receive"] });

        expect(seen?.run).toBe(sent.run);
        expect(seen).toMatchObject({ agent: "billing", parentStepId: STEP_ID, depth: 1, lastStepId: undefined });
        expect([...(seen?.tools ?? [])]).toEqual(["receive"]);
        expect((await incomingMessage(undefined, seen))?.carrier).toEqual(sent.carrier);
        // The run started elsewhere, so nothing is recorded here
        expect(takeEvents()).toEqual([]);
    });

    it("starts a fresh copy of the run when this process does not keep it", async () => {
        const sent = await runScope({}, async () => ({
            carrier: await inject({ content: "brief" }),
            run: currentScope()?.run,
        }));
        forgetRuns();

        const seen = await resume(toBaggage(sent.carrier), () => currentScope());

        expect(seen?.run).not.toBe(sent.run);
        expect(seen?.run.runId).toBe(sent.run?.runId);
        expect(seen?.run.index.size).toBe(0);
        expect(seen).toMatchObject({ agent: "default", depth: 1, parentStepId: undefined, tools: undefined });
    });

    it("gives the agent no tool the sender lacked", async () => {
        const carrier = await runScope({ tools: ["delegate", "receive", "pay"] }, () => inject({ content: "brief" }));

        const narrowed = await resume(carrier, () => currentScope()?.tools, { tools: ["receive", "admin"] });
        const inherited = await resume(carrier, () => currentScope()?.tools);

        expect([...(narrowed ?? [])]).toEqual(["receive"]);
        expect([...(inherited ?? [])]).toEqual(["delegate", "pay", "receive"]);
    });

    it("runs fn in a new run when the carrier is missing or unreadable", async () => {
        takeEvents();

        const seen = await resume(undefined, async () => currentScope(), { agent: "billing", tools: ["receive"] });

        expect(seen?.run.runId).toMatch(/^[0-9a-f]{32}$/);
        expect(seen?.agent).toBe("billing");
        expect(await incomingMessage(undefined, seen)).toBeUndefined();
        expect(takeEvents().map((event) => event.type)).toEqual(["run_started", "run_finished"]);
    });
});

describe("incomingMessage", () => {
    it("knows no message outside a resumed scope", async () => {
        expect(await incomingMessage(undefined, undefined)).toBeUndefined();
        expect(await runScope({}, () => incomingMessage(null, currentScope()))).toBeUndefined();
    });

    it("keeps the record quard.resume() found, and looks up any other carrier", async () => {
        const first = await runScope({ agent: "a" }, () => inject({ content: "one" }));
        const second = await runScope({ agent: "b" }, () => inject({ content: "two" }));

        await resume(first, async () => {
            clearRecords();
            const scope = currentScope();

            expect((await incomingMessage(undefined, scope))?.found?.record.sender).toBe("a");
            expect((await incomingMessage({ ...first }, scope))?.found?.record.sender).toBe("a");
            expect(await incomingMessage(second, scope)).toEqual({ carrier: second, found: undefined });
            expect(await incomingMessage("not a carrier", scope)).toBeUndefined();
        });
    });
});
