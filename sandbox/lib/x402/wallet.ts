import { x402Client } from "@x402/core/client";
import type { PaymentPayloadResult, SchemeNetworkClient } from "@x402/core/types";

// Base Sepolia, a test network
export const NETWORK = "eip155:84532";

let nonce = 0;

// A fake "exact" scheme: signs with a fixed fake signature, never a real key
const fakeSigner: SchemeNetworkClient = {
    scheme: "exact",
    async createPaymentPayload(version): Promise<PaymentPayloadResult> {
        nonce += 1;
        return { x402Version: version, payload: { signature: "0xfake", nonce: String(nonce) } };
    },
};

// An x402 client with a fake wallet. The fake scheme names no default
// asset, so the client's own spend caps are off.
export function testWallet(): x402Client {
    return new x402Client().register(NETWORK, fakeSigner).setSpendControls(false);
}
