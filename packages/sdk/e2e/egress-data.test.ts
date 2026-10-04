import { createRedactor, parseHashKey, type RunEvent } from "@quard/shared";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guard, isGuardRefusal, quard, type EgressOptions } from "../index.ts";
import { decisionsOf } from "../test/events.ts";
import { tempDir, writeJson } from "../test/files.ts";
import { resetAll } from "../test/reset.ts";
import { createUploader, type Send } from "../transport/uploader.ts";

// An agent sends email. Secrets, card numbers and IBANs in what it
// sends are blocked, masked or allowed before the email goes out.

// Joined at run time, so the source holds no key-shaped text
const SECRET = ["sk-", "proj-", "Zx9Qw8Er7Ty6Ui5Op4As3Df2"].join("");
const TO = "bob@acme.com";

let events: RunEvent[] = [];

beforeEach(() => {
    events = [];
    quard.configure({ onEvent: (event) => events.push(event) });
});

afterEach(() => {
    resetAll();
});

function mailer(options: Partial<EgressOptions> = {}) {
    const raw = vi.fn(async (_mail: { to: string; body: unknown }) => "sent");
    const sendEmail = guard(raw, { type: "egress", name: "sendEmail", allow: ["acme.com"], ...options });
    return { raw, sendEmail };
}

describe("data sent by email", () => {
    it("blocks a secret", async () => {
        const { raw, sendEmail } = mailer();

        const refused = await sendEmail({ to: TO, body: `Use this key: ${SECRET}` });

        expect(raw).not.toHaveBeenCalled();
        expect(isGuardRefusal(refused) && refused.text).toContain("the data to send holds a sensitive value (secret)");
    });

    it("masks a card number before the tool and the records see it", async () => {
        const { raw, sendEmail } = mailer();

        expect(await sendEmail({ to: TO, body: "Card 4242 4242 4242 4242, exp 12/29" })).toBe("sent");

        expect(raw).toHaveBeenCalledWith({ to: TO, body: "Card •••• 4242, exp 12/29" });
        expect(JSON.stringify(events)).not.toContain("4242 4242");
        expect(decisionsOf(events).find((event) => event.rule === "payload:mask")).toMatchObject({
            decision: "strip",
            enforced: true,
        });
    });

    it("sends a number that fails the Luhn check untouched", async () => {
        const { raw, sendEmail } = mailer();

        await sendEmail({ to: TO, body: "Order 4242 4242 4242 4241" });

        expect(raw).toHaveBeenCalledWith({ to: TO, body: "Order 4242 4242 4242 4241" });
    });

    it("blocks a card number passed as a number, which can't be masked", async () => {
        const { raw, sendEmail } = mailer();

        const refused = await sendEmail({ to: TO, body: 4242424242424242 });

        expect(isGuardRefusal(refused) && refused.field).toBe("card number");
        expect(raw).not.toHaveBeenCalled();
    });

    it("uploads that refused call with the number masked", async () => {
        const { sendEmail } = mailer();
        const bodies: string[] = [];
        const send: Send = async (_url, init) => {
            bodies.push(String(init.body));
            return new Response(null, { status: 202 });
        };
        const redactor = createRedactor(parseHashKey("ab".repeat(32)));

        await sendEmail({ to: TO, body: 4242424242424242 });
        const options = { webhookUrl: "http://webhook.test", key: "qk_test_abc", redactor: async () => redactor, send };
        await createUploader(options).flush();

        expect(bodies.join("\n")).toContain('"body":"4242…4242"');
        expect(bodies.join("\n")).not.toContain("4242424242424242");
    });

    it("allows an IBAN under the balanced preset and masks it under strict", async () => {
        const { raw, sendEmail } = mailer();
        const body = "Pay DE89 3704 0044 0532 0130 00";

        await sendEmail({ to: TO, body });
        quard.configure({ policyFile: writeJson(join(tempDir(), "p.json"), { version: 1, strictness: "strict" }) });
        await sendEmail({ to: TO, body });

        expect(raw.mock.calls.map(([mail]) => mail.body)).toEqual([body, "Pay DE89…3000"]);
    });

    it("lets the guard's payload option win over the preset", async () => {
        const { raw, sendEmail } = mailer({ payload: { cards: "block" } });

        const refused = await sendEmail({ to: TO, body: "Card 4242 4242 4242 4242" });

        expect(isGuardRefusal(refused) && refused.reason).toBe("sensitive_data");
        expect(raw).not.toHaveBeenCalled();
    });

    it("only records in observe mode", async () => {
        const { raw, sendEmail } = mailer({ mode: "observe" });
        const mail = { to: TO, body: `key ${SECRET}, card 4242 4242 4242 4242` };

        expect(await sendEmail(mail)).toBe("sent");

        expect(raw).toHaveBeenCalledWith(mail);
        expect(decisionsOf(events).filter((event) => event.rule.startsWith("payload:"))).toMatchObject([
            { rule: "payload:secrets", decision: "block", enforced: false },
            { rule: "payload:cards:mask", decision: "allow", enforced: false },
        ]);
    });
});
