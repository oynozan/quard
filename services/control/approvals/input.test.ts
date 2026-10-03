import { describe, expect, it } from "vitest";
import { askMessage, IBAN, REDACTOR, STEP } from "../test/messages.ts";
import { requestInput } from "./input.ts";

const DANA = "dana@acme.com";

describe("the stored request", () => {
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
