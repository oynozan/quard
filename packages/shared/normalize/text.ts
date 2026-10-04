// Characters that show nothing but can split words and values apart:
// soft hyphen, zero-width and direction marks, fillers, variation
// selectors and tag characters. Built from code points, so no
// invisible character sits in this file.
const RANGES: ReadonlyArray<readonly [number, number]> = [
    [0x00ad, 0x00ad],
    [0x034f, 0x034f],
    [0x061c, 0x061c],
    [0x115f, 0x1160],
    [0x17b4, 0x17b5],
    [0x180b, 0x180f],
    [0x200b, 0x200f],
    [0x202a, 0x202e],
    [0x2060, 0x206f],
    [0x3164, 0x3164],
    [0xfe00, 0xfe0f],
    [0xfeff, 0xfeff],
    [0xffa0, 0xffa0],
    [0x1bca0, 0x1bca3],
    [0xe0000, 0xe0fff],
];

export const INVISIBLE = new RegExp(
    `[${RANGES.map(([from, to]) => `${String.fromCodePoint(from)}-${String.fromCodePoint(to)}`).join("")}]`,
    "gu",
);

// Removes hidden characters that could split a value apart
export function cleanText(text: string): string {
    return text.normalize("NFKC").replace(INVISIBLE, "");
}

// Removes hidden characters and turns look-alike spaces, such as
// no-break spaces, into plain ones. Other characters stay as they are.
export function plainSpaces(text: string): string {
    return text.replace(INVISIBLE, "").replace(/\p{Zs}/gu, " ");
}

export function hasInvisible(text: string): boolean {
    return text.normalize("NFKC").replace(INVISIBLE, "") !== text.normalize("NFKC");
}
