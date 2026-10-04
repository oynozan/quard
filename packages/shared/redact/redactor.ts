import { replaceEmails } from "../normalize/email.ts";
import { replaceIbans } from "../normalize/iban.ts";
import { plainSpaces } from "../normalize/text.ts";
import { isCard, replaceCards } from "./cards.ts";
import { keyedHash } from "./hash.ts";
import { CUT, maskCard, maskEmail, maskIban } from "./masks.ts";
import { removeSecrets, SECRET_FIELD } from "./secrets.ts";

export type Redactor = {
    // Secrets removed; IBANs, card numbers and emails masked
    text(value: string): string;
    // A value key such as "iban:DE89...". Sensitive ones become
    // "iban:DE89…3000#<hash>", so search and tracing still match.
    key(key: string): string;
    // Every string, BigInt and card number inside a value, with secret-named fields emptied
    value(value: unknown): unknown;
};

const SENSITIVE = new Set(["iban", "email"]);
const HASHED = /^(.*)#([0-9a-f]{32})$/;
const MAX_DEPTH = 32;

// Hidden characters and look-alike spaces are cleaned first, so they
// can't split a value past the masks
export function redactText(text: string): string {
    const noSecrets = removeSecrets(plainSpaces(text));
    return replaceEmails(replaceCards(replaceIbans(noSecrets, maskIban), maskCard), maskEmail);
}

export function createRedactor(hashKey: Buffer): Redactor {
    const key = (entry: string): string => {
        const at = entry.indexOf(":");
        const kind = entry.slice(0, Math.max(at, 0));
        const raw = entry.slice(at + 1);
        if (!SENSITIVE.has(kind)) {
            return at === -1 ? redactText(entry) : `${kind}:${redactText(raw)}`;
        }
        // Already hashed, for example by the SDK: keep the hash, check the mask
        const done = HASHED.exec(raw);
        if (done !== null) {
            return `${kind}:${redactText(String(done[1]))}#${String(done[2])}`;
        }
        const mask = kind === "iban" ? maskIban(raw) : maskEmail(raw);
        return `${kind}:${mask}#${keyedHash(hashKey, kind, raw)}`;
    };

    // parents holds the objects input sits in, so its size is the depth
    const value = (input: unknown, parents: Set<object>): unknown => {
        if (typeof input === "string") {
            return redactText(input);
        }
        // JSON stores a number as the digits String() writes, so those are checked like text
        if (typeof input === "number" && isCard(String(input))) {
            return redactText(String(input));
        }
        // JSON has no BigInt, so one leaves as its digits, checked like text
        if (typeof input === "bigint") {
            return redactText(String(input));
        }
        if (input === null || typeof input !== "object") {
            return input;
        }
        // Too deep to check, or inside itself, so nothing in it is kept
        if (parents.size >= MAX_DEPTH || parents.has(input)) {
            return CUT;
        }
        parents.add(input);
        const clean = Array.isArray(input)
            ? input.map((item: unknown) => value(item, parents))
            : Object.fromEntries(
                  Object.entries(input).map(([name, item]) => [
                      redactText(name),
                      SECRET_FIELD.test(name) ? CUT : value(item, parents),
                  ]),
              );
        parents.delete(input);
        return clean;
    };

    return { text: redactText, key, value: (input) => value(input, new Set()) };
}
