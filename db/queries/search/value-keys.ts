import {
    createRedactor,
    extractValues,
    isCard,
    maskCard,
    maskEmail,
    maskIban,
    normalizeCard,
    parseHashKey,
    redactText,
    type ValueType,
} from "@quard/shared";

// What a typed value can be searched by
export type SearchKeys =
    // The keys ingest stores for the value, strongest first: the exact
    // value, then for a URL or host its host and main domain
    | { status: "ready"; kind: ValueType; shown: string; keys: string[] }
    // IBAN and email keys hold a keyed hash, so they need the hash key
    | { status: "needs-hash-key"; kind: "iban" | "email"; shown: string }
    // Ingest stores no key for card numbers
    | { status: "not-searchable"; kind: "card"; shown: string };

// Other keys stay clear text, redacted, as the shared redactor keeps them
function clearKey(key: string): string {
    const at = key.indexOf(":");
    return `${key.slice(0, at)}:${redactText(key.slice(at + 1))}`;
}

// Builds the keys ingest stores for the first traceable value in a query.
// Null when the query holds none. Throws when the hash key is set but is
// not 64 hex characters, and only for an IBAN or email.
export function searchKeys(query: string, hashKey: string | undefined): SearchKeys | null {
    const text = query.trim();
    const digits = normalizeCard(text);
    if (isCard(digits)) {
        return { status: "not-searchable", kind: "card", shown: maskCard(digits) };
    }
    const [value] = extractValues(text);
    if (value === undefined) {
        return null;
    }
    if (value.type === "iban" || value.type === "email") {
        // The mask is the part of the key before the hash
        const shown = value.type === "iban" ? maskIban(value.value) : maskEmail(value.value);
        if (!hashKey) {
            return { status: "needs-hash-key", kind: value.type, shown };
        }
        // An email's host and domain keys would also match other people there
        const keys = value.keys.slice(0, 1).map(createRedactor(parseHashKey(hashKey)).key);
        return { status: "ready", kind: value.type, shown, keys };
    }
    const keys = value.type === "url" || value.type === "host" ? value.keys : value.keys.slice(0, 1);
    return { status: "ready", kind: value.type, shown: redactText(value.value), keys: keys.map(clearKey) };
}
