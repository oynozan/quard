import { afterEach, describe, expect, it } from "vitest";
import { configure } from "../core/config.ts";
import { takeEvents } from "../core/recorder.ts";
import { isGuardRefusal } from "../core/refusal.ts";
import { guard } from "../pipeline/guard.ts";
import { CONTROL_KEY, startControlServer } from "../test/control-server.ts";
import { resetAll } from "../test/reset.ts";
import { configureQuard } from "../transport/configure.ts";
import { inject, resume } from "./carrier.ts";
import { currentScope, runScope } from "./scope.ts";

// A label record that was never stored, or that a receiver can't find

const RUN_ID = "4bf92f3577b34da6a3ce929d0e0e4736";
const HASH_KEY = "ab".repeat(32);

afterEach(() => {
    resetAll();
});

describe("inject", () => {
    it("records a warning when the control link is on but uploads are off", async () => {
        const control = await startControlServer();
        configureQuard({ key: CONTROL_KEY, controlUrl: control.url, hashKey: HASH_KEY });

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
    it("counts the depth as at the limit and warns when the record is unknown or names another run", async () => {
        configure({ runLimits: { depth: 4 } });
        const sent = await runScope({ tools: ["pay"] }, () => inject({ content: "brief" }));
        takeEvents();

        const unknown = await resume({ runId: RUN_ID, labelRef: "nope" }, () => currentScope(), { agent: "billing" });
        const other = await resume({ ...sent, runId: RUN_ID }, () => currentScope());

        expect(unknown).toMatchObject({ depth: 4, run: { runId: RUN_ID }, tools: undefined });
        expect(other).toMatchObject({ depth: 4, run: { runId: RUN_ID }, tools: undefined });
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
});
