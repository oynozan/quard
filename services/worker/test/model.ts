import { findIbans } from "@quard/shared";
import { fakeResponses } from "../../../packages/sdk/test/fake-responses.ts";

export const USAGE = { input_tokens: 2000, output_tokens: 100 };
// What one call with USAGE costs on gpt-5.4-mini
export const CALL_USD = 0.00195;

export const OPENAI = { apiKey: "sk-test", baseUrl: "http://openai.test/v1" };

// A model that pays the first valid IBAN in its input, else answers in text
export function payingModel() {
    return fakeResponses((body) => {
        const [iban] = findIbans(JSON.stringify(body.input));
        return iban === undefined
            ? { text: "I found no bank details.", usage: USAGE }
            : { calls: [{ name: "payInvoice", args: { iban, amount: 4950 } }], usage: USAGE };
    });
}
