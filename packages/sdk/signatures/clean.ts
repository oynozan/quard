import { cleanText } from "@quard/shared";

// Cleans text so case, lookalike letters, hidden marks and spacing can't
// hide a match. Applied to both the feed strings and the text checked.
export function cleanForMatch(text: string): string {
    return cleanText(text).toLowerCase().replace(/\s+/gu, "");
}
