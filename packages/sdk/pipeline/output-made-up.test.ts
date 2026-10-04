import { labelFor } from "@quard/shared";
import { afterEach, describe, expect, it } from "vitest";
import { inject } from "../context/carrier.ts";
import { currentScope, runScope } from "../context/scope.ts";
import type { GuardCall } from "../guards/call.ts";
import type { SourceOptions } from "../guards/options.ts";
import { makeCall } from "../test/call.ts";
import { resetAll } from "../test/reset.ts";
import { finishOutput } from "./output.ts";

// Values a model wrote that no record vouched for never gain trust from
// a tool's output, even when the tool returns them in other text

const IBAN = "DE89370400440532013000";
const KEY = `iban:${IBAN}`;
const BRIEF = `Pay invoice 114 to ${IBAN}.`;
const receive: SourceOptions = {
    type: "source",
    origin: "agent",
    carrierOf: (input) => (input as { carrier?: unknown }).carrier,
};

afterEach(() => {
    resetAll();
});

// Another call in the same run
function nextCall(call: GuardCall, input: unknown, tool: string): GuardCall {
    return { ...makeCall(input, [], tool), run: call.run, runId: call.runId };
}

// The sender read only trusted content, and maybe the IBAN in it
function send(withIban: boolean): ReturnType<typeof inject> {
    return runScope({ agent: "orchestrator" }, () => {
        const text = withIban ? `Supplier IBAN ${IBAN}` : "Order 114 for Acme Supplies";
        currentScope()?.run.index.add(text, labelFor("tool:crm"), "s0");
        return inject({ content: BRIEF });
    });
}

function origins(call: GuardCall): string[] {
    return call.run.index.lookup([KEY]).map((o) => o.origin);
}

describe("finishOutput with made-up values", () => {
    it("leaves them out of a guarded tool's own output", async () => {
        const call = makeCall({ key: "n" }, [], "readNote");
        call.run.index.markMadeUp([KEY]);

        await finishOutput([], call, { key: "n", note: BRIEF }, undefined);

        expect(origins(call)).toEqual([]);
        expect(call.run.index.size).toBe(1);
    });

    it("keeps a trusted message's unvouched values out of a later tool's output", async () => {
        const call = makeCall({ carrier: await send(false) });
        await finishOutput([receive], call, BRIEF, undefined);
        const later = nextCall(call, { queue: "billing" }, "checkInbox");

        await finishOutput([], later, { brief: BRIEF }, undefined);

        expect(origins(call)).toEqual([]);
    });

    it("lets a message's record vouch for a value marked made up before", async () => {
        const call = makeCall({ carrier: await send(true) });
        call.run.index.markMadeUp([KEY]);

        await finishOutput([receive], call, BRIEF, undefined);

        expect(origins(call)).toEqual(["tool:crm"]);
    });
});
