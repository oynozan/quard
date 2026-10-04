import type { RunEvent } from "@quard/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guard, isGuardRefusal, quard } from "../index.ts";
import { forgetRuns } from "../labels/records.ts";
import { resetAll } from "../test/reset.ts";

// Content from a run that read nothing came from somewhere Quard did not
// see. Passing it on through a message keeps it unknown: untrusted and
// internal.

const IBAN = "DE89370400440532013000";

let events: RunEvent[] = [];

beforeEach(() => {
    events = [];
    quard.configure({ onEvent: (event) => events.push(event) });
});

afterEach(() => {
    resetAll();
});

describe("a message from a sender run that read nothing", () => {
    it("arrives untrusted and internal, so it can't go outside the allowlist", async () => {
        const body = `Customer jane.doe@corp-internal.com, pay ${IBAN}`;
        // A router got the body from a channel Quard does not watch
        const carrier = await quard.run({ agent: "router" }, () => quard.inject({ content: body }));
        forgetRuns();
        const receive = guard(async (_input: { queue: string }) => body, {
            type: "source",
            origin: "agent",
            name: "receive",
        });
        const rawSend = vi.fn(async (_input: { to: string; body: string }) => "sent");
        const sendEmail = guard(rawSend, { type: "egress", name: "sendEmail", allow: ["acme.com"] });

        const out = await quard.resume(
            carrier,
            async () => {
                const message = String(await receive({ queue: "billing" }));
                return sendEmail({ to: "x@outside.io", body: message });
            },
            { agent: "billing" },
        );

        expect(isGuardRefusal(out)).toBe(true);
        expect(rawSend).not.toHaveBeenCalled();
        expect(events.find((event) => event.type === "message")).toMatchObject({
            from: "router",
            verified: true,
            trust: "untrusted",
            sensitivity: "internal",
        });
    });
});
