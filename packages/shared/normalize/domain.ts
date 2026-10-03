import { getDomain, parse } from "tldts";

// At most 8 labels before the ending, so long dotted runs stay fast
const HOST_IN_TEXT = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.){1,8}[a-z]{2,63}\b/gi;

export function normalizeHost(value: string): string {
    return value.trim().toLowerCase().replace(/\.$/, "");
}

// The main domain, such as acme.co.uk for mail.acme.co.uk.
// Private suffixes count too, so a.github.io and b.github.io differ.
export function mainDomain(host: string): string | undefined {
    return getDomain(host, { allowPrivateDomains: true }) ?? undefined;
}

// Finds host names whose ending is a real public suffix
export function findHosts(text: string): string[] {
    const found: string[] = [];
    for (const match of text.matchAll(HOST_IN_TEXT)) {
        const host = normalizeHost(match[0]);
        if (parse(host).isIcann === true) {
            found.push(host);
        }
    }
    return found;
}

// "acme.com" matches only acme.com; "*.acme.com" also matches its subdomains
export function hostMatches(host: string, pattern: string): boolean {
    const actual = normalizeHost(host);
    const wanted = normalizeHost(pattern);
    if (wanted.startsWith("*.")) {
        const base = wanted.slice(2);
        return actual === base || actual.endsWith(`.${base}`);
    }
    return actual === wanted;
}
