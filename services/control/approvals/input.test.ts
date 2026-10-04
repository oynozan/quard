import { describe, expect, it } from "vitest";
import { askMessage, IBAN, KEYS, STEP } from "../test/messages.ts";
import { requestInput } from "./input.ts";

const DANA = "dana@acme.com";
const REDACTOR = KEYS.redactor("project-1");

describe("the stored request", () => {
    it("keeps a card number sent as a number for the approver, and masks it in what stays after the answer", () => {
        const input = requestInput(askMessage({ args: { card: 4111111111111111, amount: 50 } }), REDACTOR);

        expect(input.args).toEqual({ card: 4111111111111111, amount: 50 });
        expect(input.masked).toEqual({ card: "4111…1111", amount: 50 });
    });

    it("keeps labels and context only redacted, since they hold paths and origins", () => {
        const message = askMessage({
            labels: [
                {
                    path: `to.${DANA}`,
                    values: [
                        {
                            type: "iban",
                            origins: [
                                {
                                    origin: `email:${DANA}`,
                                    trust: "untrusted",
                                    sensitivity: "public",
                                    flags: [],
                                    stepId: STEP,
                                    match: "exact",
                                },
                            ],
                            generated: false,
                        },
                    ],
                },
            ],
            context: { trust: "untrusted", sensitivity: "public", origins: [`tool:${IBAN}`], flagged: true },
        });

        const input = requestInput(message, REDACTOR);

        expect(input.labels).toEqual(REDACTOR.value(message.labels));
        expect(input.context).toEqual(REDACTOR.value(message.context));
        const stored = JSON.stringify([input.labels, input.context]);
        expect(stored).not.toContain(DANA);
        expect(stored).not.toContain(IBAN);
        expect(input.labels[0]?.values[0]?.origins[0]?.stepId).toBe(STEP);
    });
});
