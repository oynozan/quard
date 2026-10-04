import { afterEach, describe, expect, it } from "vitest";
import { registerCall } from "../context/registry.ts";
import { newScope } from "../context/scope.ts";
import { resetAll } from "../test/reset.ts";
import { markFrameworkTool, unguardedOutputLabel } from "./framework-tools.ts";

afterEach(() => {
    resetAll();
});

function requested(tool: string, scope = newScope({ agent: "orchestrator" })) {
    return registerCall({ callId: `call_${tool}`, tool, args: {}, scope, stepId: "s1" });
}

describe("unguardedOutputLabel", () => {
    it("labels the output of a tool the framework marked in the call's run as system content", () => {
        const call = requested("transfer_to_billing");
        markFrameworkTool(call.scope.run, "orchestrator", "transfer_to_billing");
        markFrameworkTool(call.scope.run, "orchestrator", "transfer_to_support");

        expect(unguardedOutputLabel(call, {})).toMatchObject({ origin: "system", trust: "trusted" });
        expect(unguardedOutputLabel(call, { system: { trust: "untrusted", sensitivity: "internal" } })).toMatchObject({
            origin: "system",
            trust: "untrusted",
        });
    });

    it("labels any other output no guard labeled as unknown", () => {
        const marked = newScope({ agent: "orchestrator" });
        markFrameworkTool(marked.run, "orchestrator", "transfer_to_billing");

        expect(unguardedOutputLabel(undefined, {})).toMatchObject({ origin: "unknown", trust: "untrusted" });
        expect(unguardedOutputLabel(requested("lookup", marked), {})).toMatchObject({ origin: "unknown" });
        // A mark in one run says nothing about another
        expect(unguardedOutputLabel(requested("transfer_to_billing"), {})).toMatchObject({ origin: "unknown" });
    });

    it("keeps a mark to the agent it was made for, even after a handoff switches the scope", () => {
        const scope = newScope({ agent: "orchestrator" });
        markFrameworkTool(scope.run, "orchestrator", "transfer_to_billing");
        const handoff = requested("transfer_to_billing", scope);
        // Another agent in the same run with a tool of the same name
        const lookalike = registerCall({
            callId: "call_other",
            tool: "transfer_to_billing",
            args: {},
            scope: { ...scope, agent: "support" },
            stepId: "s2",
        });
        Object.assign(scope, { agent: "billing" });

        expect(handoff.agent).toBe("orchestrator");
        expect(unguardedOutputLabel(handoff, {})).toMatchObject({ origin: "system" });
        expect(unguardedOutputLabel(lookalike, {})).toMatchObject({ origin: "unknown" });
    });
});
