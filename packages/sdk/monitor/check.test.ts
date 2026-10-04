import { afterEach, describe, expect, it } from "vitest";
import { takeEvents } from "../core/recorder.ts";
import { findCall, registerGuardedTool } from "../context/registry.ts";
import { newScope } from "../context/scope.ts";
import { withoutRunEdges } from "../test/call.ts";
import { resetAll } from "../test/reset.ts";
import { checkRequestedCalls } from "./check.ts";
import { addFrameworkTools } from "./framework-tools.ts";

afterEach(() => {
    resetAll();
});

describe("checkRequestedCalls", () => {
    it("registers allowed calls and warns about unwrapped tools", () => {
        registerGuardedTool("fetchPage");
        const scope = newScope();

        checkRequestedCalls(
            [
                { callId: "c1", name: "fetchPage", arguments: '{"url":"https://a.com"}' },
                { callId: "c2", name: "rmrf", arguments: "not json" },
            ],
            scope,
            "s1",
        );

        expect(findCall("c1")).toMatchObject({ argsKey: '{"url":"https://a.com"}', blocked: undefined });
        expect(findCall("c2")?.argsKey).toBe('"not json"');
        expect(
            withoutRunEdges(takeEvents()).map((event) => [event.type, event.type === "warning" ? event.tool : ""]),
        ).toEqual([
            ["decision", ""],
            ["decision", ""],
            ["warning", "rmrf"],
        ]);
    });

    it("does not warn about tools the agent framework runs itself in that run", () => {
        const scope = newScope();
        const other = newScope();
        addFrameworkTools(scope.run, ["transfer_to_billing"]);
        takeEvents();

        const calls = [{ callId: "c4", name: "transfer_to_billing", arguments: "{}" }];
        checkRequestedCalls(calls, scope, "s1");
        checkRequestedCalls([{ ...calls[0], callId: "c5" }] as typeof calls, other, "s2");

        const warnings = takeEvents().filter((event) => event.type === "warning");
        expect(warnings).toEqual([expect.objectContaining({ runId: other.run.runId, tool: "transfer_to_billing" })]);
    });

    it("marks a call blocked when the agent may not use the tool", () => {
        registerGuardedTool("payInvoice");

        checkRequestedCalls([{ callId: "c3", name: "payInvoice", arguments: "{}" }], newScope({ tools: [] }), "s1");

        expect(findCall("c3")?.blocked).toEqual({ guard: "permission", reason: "permission_denied" });
        expect(withoutRunEdges(takeEvents())[0]).toMatchObject({ decision: "block", reason: "permission_denied" });
    });
});
