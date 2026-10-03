import type { Span } from "./spans.ts";

// 13 to 19 digits, with single spaces or dashes allowed between them.
// The lookbehind starts each match at a token edge, so the scan stays linear.
const CARD = /(?<![\d-])\d(?:[ -]?\d){12,18}(?![\d-])/g;

export function luhnValid(digits: string): boolean {
    let sum = 0;
    for (let i = 0; i < digits.length; i += 1) {
        let digit = Number(digits[digits.length - 1 - i]);
        if (i % 2 === 1) {
            digit *= 2;
            if (digit > 9) {
                digit -= 9;
            }
        }
        sum += digit;
    }
    return sum % 10 === 0;
}

// Card numbers: a card prefix (2 to 6) and a valid Luhn checksum
export function findCards(text: string): Span[] {
    const found: Span[] = [];
    for (const match of text.matchAll(CARD)) {
        const digits = match[0].replace(/[ -]/g, "");
        if (/^[2-6]/.test(digits) && luhnValid(digits)) {
            found.push({ start: match.index, end: match.index + match[0].length, value: digits });
        }
    }
    return found;
}
