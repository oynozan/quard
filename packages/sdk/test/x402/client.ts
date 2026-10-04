import { x402Client } from "@x402/core/client";
import type { PaymentPayloadResult, SchemeNetworkClient } from "@x402/core/types";
import { markChecked } from "../../x402/checked.ts";

let nonce = 0;

// A fake "exact" scheme: signs with a fixed fake signature, never a real key
export const fakeScheme: SchemeNetworkClient = {
    scheme: "exact",
    async createPaymentPayload(version, requirements): Promise<PaymentPayloadResult> {
        nonce += 1;
        const payload = { signature: "0xfake", nonce: String(nonce) };
        // v1 payloads name their scheme and network themselves
        return version === 1
            ? ({
                  x402Version: 1,
                  scheme: requirements.scheme,
                  network: requirements.network,
                  payload,
              } as PaymentPayloadResult)
            : { x402Version: version, payload };
    },
};

// An x402 client for the test networks. guarded: true stands in for the
// x402 guard, which marks each payment it checked.
export function testClient(guarded = true): x402Client {
    // The fake scheme names no default asset, so the client's own caps are off
    const client = new x402Client()
        .register("eip155:84532", fakeScheme)
        .registerV1("base-sepolia", fakeScheme)
        .setSpendControls(false);
    if (guarded) {
        client.onAfterPaymentCreation(async ({ paymentPayload }) => markChecked(paymentPayload));
    }
    return client;
}
