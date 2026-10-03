const ID_IN_TEXT = /(?<![\w-])[\w-]{8,}(?![\w-])/g;
const DATE = /^\d{4}-\d{2}-\d{2}$|^\d{2}-\d{2}-\d{4}$/;

// An ID-like value: 8 or more characters, no spaces, at least one digit
export function isIdentifierLike(value: string): boolean {
    return value.length >= 8 && !/\s/.test(value) && /\d/.test(value) && !DATE.test(value);
}

export function findIds(text: string): string[] {
    return [...text.matchAll(ID_IN_TEXT)]
        .map((match) => match[0])
        .filter(isIdentifierLike)
        .map((value) => value.toLowerCase());
}
