import { afterEach, describe, expect, it } from "vitest";
import { registerCall } from "../context/registry.ts";
import { newScope } from "../context/scope.ts";
import { resetAll } from "../test/reset.ts";
import { markFrameworkTool, unguardedOutputLabel } from "./framework-tools.ts";

afterEach(() => {
    resetAll();
});

function requested(tool: string, scope = newScope()) {
    return registerCall({ callId: `call_${tool}`, tool, args: {}, scope, stepId: "s1" });
}

describe("unguardedOutputLabel", () => {
    it("labels the output of a tool the framework marked in the call's run as system content", () => {
        const call = requested("transfer_to_billing");
        markFrameworkTool(call.scope.run, "transfer_to_billing");
        markFrameworkTool(call.scope.run, "transfer_to_support");

        expect(unguardedOutputLabel(call, {})).toMatchObject({ origin: "system", trust: "trusted" });
        expect(unguardedOutputLabel(call, { system: { trust: "untrusted", sensitivity: "internal" } })).toMatchObject({
            origin: "system",
            trust: "untrusted",
        });
    });

    it("labels any other output no guard labeled as unknown", () => {
        const marked = newScope();
        markFrameworkTool(marked.run, "transfer_to_billing");

        expect(unguardedOutputLabel(undefined, {})).toMatchObject({ origin: "unknown", trust: "untrusted" });
        expect(unguardedOutputLabel(requested("lookup", marked), {})).toMatchObject({ origin: "unknown" });
        // A mark in one run says nothing about another
        expect(unguardedOutputLabel(requested("transfer_to_billing"), {})).toMatchObject({ origin: "unknown" });
    });
});
