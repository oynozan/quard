import type { Payment } from "@/lib/data/payments/types";

type Tone = "on" | "off" | "context" | "warning" | "danger";

// "0x1234…abcd": enough to tell wallets apart; the full address goes in a title
export function shortAddress(address: string): string {
    return address.length > 13 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

// Settled, but the paid response was an error
export const notDelivered = (payment: Payment) => payment.stage === "settled" && payment.delivered === false;

// The word and status square for how far a payment got
export function paymentState(payment: Payment): { word: string; tone: Tone } {
    if (notDelivered(payment)) return { word: "Paid, not delivered", tone: "warning" };
    switch (payment.stage) {
        case "challenged":
            return { word: "Price asked", tone: "off" };
        case "refused":
            return { word: "Refused", tone: "danger" };
        case "signed":
            return { word: "Signed", tone: "context" };
        case "settled":
            return { word: "Settled", tone: "context" };
        case "failed":
            return { word: "Failed", tone: "danger" };
    }
}
