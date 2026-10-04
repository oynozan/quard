import type { Span } from "../redact/spans.ts";

// IBAN length per country (ISO 13616 registry)
const LENGTHS: Record<string, number> = {
    AD: 24,
    AE: 23,
    AL: 28,
    AT: 20,
    AZ: 28,
    BA: 20,
    BE: 16,
    BG: 22,
    BH: 22,
    BI: 27,
    BR: 29,
    BY: 28,
    CH: 21,
    CR: 22,
    CY: 28,
    CZ: 24,
    DE: 22,
    DJ: 27,
    DK: 18,
    DO: 28,
    EE: 20,
    EG: 29,
    ES: 24,
    FI: 18,
    FK: 18,
    FO: 18,
    FR: 27,
    GB: 22,
    GE: 22,
    GI: 23,
    GL: 18,
    GR: 27,
    GT: 28,
    HN: 28,
    HR: 21,
    HU: 28,
    IE: 22,
    IL: 23,
    IQ: 23,
    IS: 26,
    IT: 27,
    JO: 30,
    KW: 30,
    KZ: 20,
    LB: 28,
    LC: 32,
    LI: 21,
    LT: 20,
    LU: 20,
    LV: 21,
    LY: 25,
    MC: 27,
    MD: 24,
    ME: 22,
    MK: 19,
    MN: 20,
    MR: 27,
    MT: 31,
    MU: 30,
    NI: 28,
    NL: 18,
    NO: 15,
    OM: 23,
    PK: 24,
    PL: 28,
    PS: 29,
    PT: 25,
    QA: 29,
    RO: 24,
    RS: 22,
    RU: 33,
    SA: 24,
    SC: 31,
    SD: 18,
    SE: 24,
    SI: 19,
    SK: 24,
    SM: 27,
    SO: 23,
    ST: 25,
    SV: 28,
    TL: 23,
    TN: 24,
    TR: 26,
    UA: 29,
    VA: 22,
    VG: 24,
    XK: 20,
    YE: 30,
};

// Spaces or tabs may sit between the characters, any number of them
const IBAN_IN_TEXT = /\b([A-Z]{2})\d{2}(?:[ \t]*[A-Z0-9]){11,32}/gi;

export function normalizeIban(value: string): string {
    return value.replace(/\s+/g, "").toUpperCase();
}

// The mod-97 remainder, with the country and check digits moved to the end
function mod97(iban: string): number {
    const moved = iban.slice(4) + iban.slice(0, 4);
    const digits = moved.replace(/[A-Z]/g, (letter) => String(letter.charCodeAt(0) - 55));
    let rest = 0;
    for (const digit of digits) {
        rest = (rest * 10 + Number(digit)) % 97;
    }
    return rest;
}

// Checks the country length and the mod-97 check digits
export function isValidIban(value: string): boolean {
    const iban = normalizeIban(value);
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban) || LENGTHS[iban.slice(0, 2)] !== iban.length) {
        return false;
    }
    return mod97(iban) === 1;
}

// A valid IBAN for a country, its account digits taken from a hex seed.
// Undefined for a country with no IBAN length.
export function ibanFrom(country: string, seedHex: string): string | undefined {
    const length = Object.hasOwn(LENGTHS, country) ? LENGTHS[country] : undefined;
    if (length === undefined) {
        return undefined;
    }
    const digits = BigInt(`0x${seedHex}`)
        .toString()
        .padStart(length - 4, "0")
        .slice(0, length - 4);
    const check = String(98 - mod97(`${country}00${digits}`)).padStart(2, "0");
    return `${country}${check}${digits}`;
}

// How many raw characters hold the first `count` non-space characters
function rawLength(raw: string, count: number): number {
    let seen = 0;
    let index = 0;
    while (seen < count) {
        if (!/\s/.test(raw.charAt(index))) {
            seen += 1;
        }
        index += 1;
    }
    return index;
}

// Each valid IBAN in a text, in normalized form, with where it is written
export function ibanSpans(text: string): Span[] {
    const found: Span[] = [];
    const pattern = new RegExp(IBAN_IN_TEXT.source, "gi");
    let match = pattern.exec(text);
    while (match !== null) {
        const candidate = normalizeIban(match[0]);
        const length = LENGTHS[candidate.slice(0, 2)];
        // A match can run into the next word, so cut it to the country length
        if (length !== undefined && isValidIban(candidate.slice(0, length))) {
            const end = match.index + rawLength(match[0], length);
            found.push({ start: match.index, end, value: candidate.slice(0, length) });
            pattern.lastIndex = end;
        } else {
            pattern.lastIndex = match.index + 1;
        }
        match = pattern.exec(text);
    }
    return found;
}

export function findIbans(text: string): string[] {
    return ibanSpans(text).map((match) => match.value);
}

// Replaces each valid IBAN in a text, given in normalized form
export function replaceIbans(text: string, replace: (iban: string) => string): string {
    let out = "";
    let last = 0;
    for (const match of ibanSpans(text)) {
        out += text.slice(last, match.start) + replace(match.value);
        last = match.end;
    }
    return out + text.slice(last);
}
