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

// What one value() call has walked through
type Walk = {
    // The objects the current value sits in, as many as its depth
    parents: Set<object>;
    copied: Set<object>;
    // Some value sat inside itself, so it can never be JSON
    cyclic: boolean;
};

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

    const value = (input: unknown, walk: Walk): unknown => {
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
        // JSON leaves functions out, so no toJSON is left to run when the copy is sent
        if (typeof input === "function") {
            return undefined;
        }
        if (input === null || typeof input !== "object") {
            return input;
        }
        // Inside itself, so nothing in it is kept
        if (walk.parents.has(input)) {
            walk.cyclic = true;
            return CUT;
        }
        // Too deep, or met again after a cycle, where copying every path could take minutes
        if (walk.parents.size >= MAX_DEPTH || (walk.cyclic && walk.copied.has(input))) {
            return CUT;
        }
        walk.parents.add(input);
        walk.copied.add(input);
        const clean = copy(input, walk);
        walk.parents.delete(input);
        return clean;
    };

    // What JSON writes for an object, so a Date leaves as the ISO text its toJSON gives
    const copy = (input: object, walk: Walk): unknown => {
        const toJSON = (input as { toJSON?: unknown }).toJSON;
        const plain: unknown = typeof toJSON === "function" ? toJSON.call(input) : input;
        if (plain === null || typeof plain !== "object") {
            return value(plain, walk);
        }
        if (Array.isArray(plain)) {
            return plain.map((item: unknown) => value(item, walk));
        }
        return Object.fromEntries(
            Object.entries(plain).map(([name, item]) => [
                redactText(name),
                SECRET_FIELD.test(name) ? CUT : value(item, walk),
            ]),
        );
    };

    return {
        text: redactText,
        key,
        value: (input) => value(input, { parents: new Set(), copied: new Set(), cyclic: false }),
    };
}
