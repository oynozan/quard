// The parts of an @x402/core x402Client the guard uses. They are written
// out here, so the SDK needs @x402/core only when an app uses x402.

// One payment option. v2 names the price `amount`; v1 named it
// `maxAmountRequired` and kept the paid URL on the option.
export type X402Requirements = {
    scheme: string;
    network: string;
    asset: string;
    payTo: string;
    amount?: string;
    maxAmountRequired?: string;
    resource?: string;
    maxTimeoutSeconds?: number;
};

export type PaymentCreationContext = {
    paymentRequired: { x402Version: number; resource?: unknown };
    selectedRequirements: X402Requirements;
};

export type PaymentCreatedContext = PaymentCreationContext & { paymentPayload: unknown };

export type BeforePayment = (context: PaymentCreationContext) => Promise<void | { abort: true; reason: string }>;
export type AfterPayment = (context: PaymentCreatedContext) => Promise<void>;

export type X402Client = {
    onBeforePaymentCreation(hook: BeforePayment): unknown;
    onAfterPaymentCreation(hook: AfterPayment): unknown;
};
