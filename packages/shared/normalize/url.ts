import { normalizeHost } from "./domain.ts";

const URL_IN_TEXT = /\bhttps?:\/\/[^\s<>"'`)\]]+/gi;

// Puts a web address in one standard form, without the #fragment
export function normalizeUrl(value: string): string | undefined {
    let url: URL;
    try {
        url = new URL(value.trim());
    } catch {
        return undefined;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        return undefined;
    }
    url.hash = "";
    return url.href;
}

export function findUrls(text: string): string[] {
    const found: string[] = [];
    for (const match of text.matchAll(URL_IN_TEXT)) {
        const url = normalizeUrl(match[0].replace(/[.,;:!?]+$/, ""));
        if (url !== undefined) {
            found.push(url);
        }
    }
    return found;
}

export function urlHost(url: string): string {
    return normalizeHost(new URL(url).hostname);
}
