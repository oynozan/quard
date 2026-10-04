import type { PaymentOption, PaymentResponse } from "@quard/shared";

export const USDC_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
export const PAYEE = "0x209693Bc6afc0C5328bA36FaF03C514EF312287C";
export const PAYER = "0x857b06519E91e3A54538791bDbb0E22373e36b66";

export const v2Options: PaymentOption[] = [
    {
        scheme: "exact",
        network: "eip155:84532",
        amount: "10000",
        asset: USDC_SEPOLIA,
        payTo: PAYEE,
        maxTimeoutSeconds: 60,
        extra: { name: "USDC", version: "2" },
    },
    {
        scheme: "exact",
        network: "eip155:8453",
        amount: "20000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: PAYEE,
        maxTimeoutSeconds: 60,
        extra: {},
    },
];

export const v1Option = {
    scheme: "exact",
    network: "base-sepolia",
    maxAmountRequired: "5000",
    resource: "",
    description: "Old data",
    mimeType: "application/json",
    outputSchema: {},
    payTo: PAYEE,
    maxTimeoutSeconds: 60,
    asset: USDC_SEPOLIA,
    extra: {},
};

// A stand-in for an x402 facilitator: checks the fake signature and
// "settles" without touching a chain
export function stubFacilitator() {
    const state = {
        settled: 0,
        invalid: undefined as string | undefined,
        settleError: undefined as string | undefined,
        amount: undefined as string | undefined,
    };
    return {
        state,
        verify(payment: unknown): string | undefined {
            const signature = (payment as { payload?: { signature?: unknown } } | null)?.payload?.signature;
            return state.invalid ?? (signature === "0xfake" ? undefined : "invalid_signature");
        },
        settle(network: string): PaymentResponse {
            if (state.settleError !== undefined) {
                return { success: false, transaction: "", network, errorReason: state.settleError };
            }
            state.settled += 1;
            const transaction = `0x${state.settled.toString(16).padStart(64, "0")}`;
            return {
                success: true,
                transaction,
                network,
                payer: PAYER,
                ...(state.amount ? { amount: state.amount } : {}),
            };
        },
    };
}

export type StubFacilitator = ReturnType<typeof stubFacilitator>;
