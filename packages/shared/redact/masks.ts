// What the dashboard shows in place of a sensitive value
export const CUT = "…";

// "DE89370400440532013000" becomes "DE89…3000"
export function maskIban(iban: string): string {
    return `${iban.slice(0, 4)}${CUT}${iban.slice(-4)}`;
}

// "4111111111111111" becomes "4111…1111"
export function maskCard(digits: string): string {
    return `${digits.slice(0, 4)}${CUT}${digits.slice(-4)}`;
}

// The domain stays visible: "jane@acme.com" becomes "j…@acme.com"
export function maskEmail(email: string): string {
    return `${email.slice(0, 1)}${CUT}${email.slice(email.lastIndexOf("@"))}`;
}
