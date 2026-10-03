// 13 to 19 digits, maybe split by spaces or dashes
const CARD_IN_TEXT = /\b\d(?:[ -]?\d){12,18}\b/g;

export function normalizeCard(value: string): string {
    return value.replace(/[ -]/g, "");
}

// Card networks start with 2 to 6, and the Luhn check must pass
export function isCard(digits: string): boolean {
    if (!/^[2-6]\d{12,18}$/.test(digits)) {
        return false;
    }
    let sum = 0;
    for (let i = 0; i < digits.length; i++) {
        const digit = digits.charCodeAt(digits.length - 1 - i) - 48;
        const doubled = digit * 2;
        sum += i % 2 === 0 ? digit : doubled > 9 ? doubled - 9 : doubled;
    }
    return sum % 10 === 0;
}

// Replaces each card number in a text, given as digits only
export function replaceCards(text: string, replace: (digits: string) => string): string {
    return text.replace(CARD_IN_TEXT, (match) => {
        const digits = normalizeCard(match);
        return isCard(digits) ? replace(digits) : match;
    });
}
