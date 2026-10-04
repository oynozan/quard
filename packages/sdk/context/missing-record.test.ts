import { afterEach, describe, expect, it } from "vitest";
import { configure } from "../core/config.ts";
import { projectKey } from "../core/project-key.ts";
import { takeEvents } from "../core/recorder.ts";
import { isGuardRefusal } from "../core/refusal.ts";
import { guard } from "../pipeline/guard.ts";
import { CONTROL_KEY, startControlServer } from "../test/control-server.ts";
import { PROJECT_KEY } from "../test/hash-key.ts";
import { resetAll } from "../test/reset.ts";
import { startWebhookServer, WEBHOOK_KEY } from "../test/webhook-server.ts";
import { configureQuard } from "../transport/configure.ts";
import { inject, resume } from "./carrier.ts";
import { currentScope, runScope } from "./scope.ts";

// A label record that was never stored, or that a receiver can't find

const RUN_ID = "4bf92f3577b34da6a3ce929d0e0e4736";

afterEach(() => {
    resetAll();
});

describe("inject", () => {
    it("records a warning when the control link is on but uploads are off", async () => {
        const control = await startControlServer();
        configureQuard({ key: CONTROL_KEY, controlUrl: control.url });

        const carrier = await runScope({ agent: "orchestrator" }, () => inject({ content: "brief" }));

        expect(takeEvents().find((event) => event.type === "warning")).toMatchObject({
            runId: carrier.runId,
            agent: "orchestrator",
            code: "label_record_not_stored",
        });
        resetAll();
        await control.close();
    });
});

describe("resume", () => {
    it("counts the depth as past any limit and warns when the record is unknown or names another run", async () => {
        configure({ runLimits: { depth: 4 } });
        const sent = await runScope({ tools: ["pay"] }, () => inject({ content: "brief" }));
        takeEvents();

        const unknown = await resume({ runId: RUN_ID, labelRef: "nope" }, () => currentScope(), { agent: "billing" });
        const other = await resume({ ...sent, runId: RUN_ID }, () => currentScope());

        const depth = Number.MAX_SAFE_INTEGER;
        expect(unknown).toMatchObject({ depth, run: { runId: RUN_ID }, tools: undefined });
        expect(other).toMatchObject({ depth, run: { runId: RUN_ID }, tools: undefined });
        expect(takeEvents().filter((event) => event.type === "warning")).toEqual([
            {
                type: "warning",
                runId: RUN_ID,
                stepId: expect.stringMatching(/^[0-9a-f]{16}$/),
                agent: "billing",
                at: expect.any(String),
                code: "label_record_not_found",
            },
            expect.objectContaining({ agent: "default", code: "label_record_not_found" }),
        ]);
    });

    it("still gets the project's key first, so what the receiver hashes matches the backend", async () => {
        const webhook = await startWebhookServer();
        configureQuard({ key: WEBHOOK_KEY, webhookUrl: webhook.url });

        const key = await resume({ runId: RUN_ID, labelRef: "0".repeat(16) }, () => projectKey());

        expect(key).toEqual(PROJECT_KEY);
        resetAll();
        await webhook.close();
    });

    it("gives only the agent's own tools when the record is unknown", async () => {
        const tools = await resume({ runId: RUN_ID, labelRef: "nope" }, () => currentScope()?.tools, {
            tools: ["receive"],
        });

        expect([...(tools ?? [])]).toEqual(["receive"]);
    });

    it("blocks a delegation from an agent whose record is unknown, once depth limits are on", async () => {
        configure({ runLimits: { mode: "block" } });
        const delegate = guard(async (_input: { to: string }) => "sent", {
            type: "limit",
            name: "delegate",
            delegateTo: "to",
        });

        const out = await resume({ runId: RUN_ID, labelRef: "nope" }, () => delegate({ to: "helper" }));

        expect(isGuardRefusal(out)).toBe(true);
        expect(takeEvents().find((event) => event.type === "decision" && event.rule === "max-depth")).toMatchObject({
            decision: "block",
            reason: "limit_reached",
        });
    });

    it("keeps blocking that delegation after the depth limit is raised", async () => {
        configure({ runLimits: { mode: "block", depth: 2 } });
        const delegate = guard(async (_input: { to: string }) => "sent", {
            type: "limit",
            name: "delegate",
            delegateTo: "to",
        });

        const out = await resume({ runId: RUN_ID, labelRef: "nope" }, () => {
            configure({ runLimits: { mode: "block", depth: 50 } });
            return delegate({ to: "helper" });
        });

        expect(isGuardRefusal(out)).toBe(true);
    });
});
