// Bounded parts keep matching fast on long tokens
const EMAIL_IN_TEXT = /[A-Z0-9._%+-]{1,64}@[A-Z0-9.-]{1,253}\.[A-Z]{2,63}/gi;

export function normalizeEmail(value: string): string {
    return value.trim().toLowerCase();
}

export function findEmails(text: string): string[] {
    return [...text.matchAll(EMAIL_IN_TEXT)].map((match) => normalizeEmail(match[0]));
}

// Replaces each email address in a text, given in normalized form
export function replaceEmails(text: string, replace: (email: string) => string): string {
    return text.replace(EMAIL_IN_TEXT, (match) => replace(normalizeEmail(match)));
}

export function emailHost(email: string): string {
    return email.slice(email.lastIndexOf("@") + 1);
}
