// Masks for sensitive values, as PROJECT.md "Redaction" describes.
// The dashboard shows masks. Only an open approval shows full values.

export type SensitiveKind = "iban" | "card" | "email" | "secret";

const CUT = "…";

const IBAN_SHAPE = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/;
const EMAIL_SHAPE = /^[^\s@]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i;

// Gitleaks-style key shapes. The prefix stays visible so people can tell keys apart.
const SECRET_SHAPES: { whole: RegExp; prefix: RegExp; inText: RegExp }[] = [
    {
        whole: /^qk_(live|test)_[a-z0-9]{16,}$/i,
        prefix: /^qk_(live|test)_/i,
        inText: /\bqk_(?:live|test)_[a-z0-9]{16,}/gi,
    },
    { whole: /^sk-(proj-)?[\w-]{20,}$/, prefix: /^sk-(proj-)?/, inText: /\bsk-(?:proj-)?[\w-]{20,}/g },
    {
        whole: /^(sk|rk)_(live|test)_\w{16,}$/,
        prefix: /^(sk|rk)_(live|test)_/,
        inText: /\b(?:sk|rk)_(?:live|test)_\w{16,}/g,
    },
    { whole: /^gh[pousr]_[A-Za-z0-9]{30,}$/, prefix: /^gh[pousr]_/, inText: /\bgh[pousr]_[A-Za-z0-9]{30,}/g },
    { whole: /^xox[abprs]-[\w-]{10,}$/, prefix: /^xox[abprs]-/, inText: /\bxox[abprs]-[\w-]{10,}/g },
    { whole: /^(AKIA|ASIA)[A-Z0-9]{16}$/, prefix: /^(AKIA|ASIA)/, inText: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
    { whole: /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/, prefix: /^eyJ/, inText: /\beyJ[\w-]+\.[\w-]+\.[\w-]+/g },
];

export function normalizeIban(value: string): string {
    return value.replace(/\s+/g, "").toUpperCase();
}

// Pattern plus the ISO 13616 mod-97 check.
export function isIban(value: string): boolean {
    const iban = normalizeIban(value);
    if (!IBAN_SHAPE.test(iban)) return false;
    const moved = iban.slice(4) + iban.slice(0, 4);
    let rest = 0;
    for (const char of moved) {
        const code = char.charCodeAt(0);
        const digits = code >= 65 ? String(code - 55) : char;
        for (const digit of digits) rest = (rest * 10 + Number(digit)) % 97;
    }
    return rest === 1;
}

// "DE89 3704 0044 0532 0130 00" becomes "DE89…3000".
export function maskIban(value: string): string {
    const iban = normalizeIban(value);
    if (iban.length < 9) return CUT;
    return `${iban.slice(0, 4)}${CUT}${iban.slice(-4)}`;
}

export function normalizeCard(value: string): string {
    return value.replace(/[\s-]+/g, "");
}

// Pattern plus the Luhn check.
export function isCard(value: string): boolean {
    const digits = normalizeCard(value);
    if (!/^\d{13,19}$/.test(digits)) return false;
    let sum = 0;
    for (let i = 0; i < digits.length; i++) {
        let digit = Number(digits[digits.length - 1 - i]);
        if (i % 2 === 1) {
            digit *= 2;
            if (digit > 9) digit -= 9;
        }
        sum += digit;
    }
    return sum % 10 === 0;
}

export function maskCard(value: string): string {
    const digits = normalizeCard(value);
    if (digits.length < 9) return CUT;
    return `${digits.slice(0, 4)}${CUT}${digits.slice(-4)}`;
}

export function normalizeEmail(value: string): string {
    return value.trim().toLowerCase();
}

export function isEmail(value: string): boolean {
    return EMAIL_SHAPE.test(value.trim());
}

// The domain stays visible: "refunds@claims-desk.io" becomes "r…@claims-desk.io".
export function maskEmail(value: string): string {
    const email = normalizeEmail(value);
    const at = email.lastIndexOf("@");
    if (at < 1) return CUT;
    return `${email[0]}${CUT}${email.slice(at)}`;
}

export function isSecret(value: string): boolean {
    return SECRET_SHAPES.some((shape) => shape.whole.test(value.trim()));
}

// Keeps a known prefix and four more characters: "qk_live_7f31…".
export function maskSecret(value: string): string {
    const secret = value.trim();
    const shape = SECRET_SHAPES.find((s) => s.whole.test(secret));
    const prefix = shape ? (secret.match(shape.prefix)?.[0] ?? "") : "";
    const keep = prefix.length + 4;
    if (secret.length <= keep + 4) return `${secret.slice(0, Math.min(4, secret.length))}${CUT}`;
    return `${secret.slice(0, keep)}${CUT}`;
}

export function sensitiveKind(value: string): SensitiveKind | null {
    if (isIban(value)) return "iban";
    if (isCard(value)) return "card";
    if (isEmail(value)) return "email";
    if (isSecret(value)) return "secret";
    return null;
}

// Masks a whole value when it is sensitive, and returns anything else unchanged.
export function maskValue(value: string): string {
    switch (sensitiveKind(value)) {
        case "iban":
            return maskIban(value);
        case "card":
            return maskCard(value);
        case "email":
            return maskEmail(value);
        case "secret":
            return maskSecret(value);
        default:
            return value;
    }
}

// Every valid IBAN inside a longer text, written as it appears there.
export function findIbans(text: string): string[] {
    const found: string[] = [];
    for (const match of text.matchAll(/\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]){11,34}/g)) {
        const parts = match[0].split(" ");
        for (let n = parts.length; n > 0; n--) {
            const head = parts.slice(0, n).join(" ");
            if (isIban(head)) {
                found.push(head);
                break;
            }
        }
    }
    return found;
}

const EMAIL_IN_TEXT = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const CARD_IN_TEXT = /\b(?:\d[ -]?){12,18}\d\b/g;

// Masks every IBAN, card number, email and key inside a longer text.
export function maskText(text: string): string {
    let out = text;
    for (const iban of findIbans(out)) out = out.split(iban).join(maskIban(iban));
    out = out.replace(CARD_IN_TEXT, (match) => (isCard(match) ? maskCard(match) : match));
    out = out.replace(EMAIL_IN_TEXT, (match) => maskEmail(match));
    for (const shape of SECRET_SHAPES) out = out.replace(shape.inText, (match) => maskSecret(match));
    return out;
}
