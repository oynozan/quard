import { findIbans } from "../normalize/iban.ts";
import { cleanText } from "../normalize/text.ts";
import { findCards } from "./cards.ts";
import { findSecrets, SECRET_MASK } from "./secrets.ts";
import { blankSpans, type Span } from "./spans.ts";

export type SensitiveKind = "secrets" | "cards" | "ibans";
export type Sensitive = Span & { kind: SensitiveKind };

export function maskIban(iban: string): string {
    return `${iban.slice(0, 4)}…${iban.slice(-4)}`;
}

export function maskCard(digits: string): string {
    return `•••• ${digits.slice(-4)}`;
}

const MASKS: Record<SensitiveKind, (value: string) => string> = {
    secrets: () => SECRET_MASK,
    cards: maskCard,
    ibans: maskIban,
};

// findIbans gives normalized values, so find where each one is written,
// spaces included
function ibanSpans(text: string): Span[] {
    const ibans = new Set(findIbans(text.replace(/[ \t]+/g, " ")));
    return [...ibans].flatMap((iban) =>
        [...text.matchAll(new RegExp(iban.split("").join("\\s*"), "gi"))].map((match) => ({
            start: match.index,
            end: match.index + match[0].length,
            value: iban,
        })),
    );
}

// Secrets, card numbers and IBANs in a text. IBANs come first, so their
// digits are not read again as card numbers.
export function findSensitive(text: string): Sensitive[] {
    const ibans = ibanSpans(text).map((span) => ({ ...span, kind: "ibans" as const }));
    const cards = findCards(blankSpans(text, ibans)).map((span) => ({ ...span, kind: "cards" as const }));
    const secrets = findSecrets(text).map((span) => ({ ...span, kind: "secrets" as const }));
    return [...secrets, ...ibans, ...cards];
}

// Masks the given kinds. Hidden characters are removed first, so they
// can't split a value past the scan. When finds overlap, the one that
// starts first is masked whole, so a card number inside a token can't
// leave the rest of the token in clear.
export function maskSensitive(text: string, kinds: ReadonlySet<SensitiveKind>): string {
    const clean = cleanText(text);
    const kept: Sensitive[] = [];
    for (const found of findSensitive(clean).sort((a, b) => a.start - b.start)) {
        const last = kept.at(-1);
        if (last === undefined || found.start >= last.end) {
            kept.push(found);
        }
    }
    const masks = kept.filter((found) => kinds.has(found.kind));
    if (masks.length === 0) {
        return text;
    }
    return masks.reduceRight(
        (out, found) => out.slice(0, found.start) + MASKS[found.kind](found.value) + out.slice(found.end),
        clean,
    );
}
