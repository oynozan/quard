import { z } from "zod";

// x402: a server answers 402 with a price, the client signs a payment and
// sends the request again, and the server answers with the settlement.
// v2 carries each part base64 in a header; v1 put the price in the body.

export const X402_HEADERS = {
    required: "payment-required",
    signature: "payment-signature",
    response: "payment-response",
    v1Payment: "x-payment",
    v1Response: "x-payment-response",
} as const;

// One payment option a server accepts. Amounts are atomic units.
export const paymentOption = z.object({
    scheme: z.string().min(1).max(100),
    network: z.string().min(1).max(200),
    amount: z.string().regex(/^\d{1,78}$/),
    asset: z.string().min(1).max(200),
    payTo: z.string().min(1).max(200),
    maxTimeoutSeconds: z.number().int().nonnegative().optional(),
    extra: z.record(z.string(), z.unknown()).optional(),
});

export const paymentRequired = z.object({
    x402Version: z.number().int().min(1),
    // v2: { url, description, mimeType }; v1 kept it on each option
    resource: z.unknown().optional(),
    accepts: z.array(paymentOption).min(1).max(50),
    error: z.string().max(2000).optional(),
});

export const paymentResponse = z.object({
    success: z.boolean(),
    transaction: z.string().max(200).optional(),
    network: z.string().max(200).optional(),
    payer: z.string().max(200).optional(),
    amount: z.string().max(80).optional(),
    errorReason: z.string().max(2000).optional(),
});

export type PaymentOption = z.infer<typeof paymentOption>;
export type PaymentRequired = z.infer<typeof paymentRequired>;
export type PaymentResponse = z.infer<typeof paymentResponse>;
