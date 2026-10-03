import { findIbans, isCard, isEmail, isIban, normalizeCard, normalizeEmail, normalizeIban } from "../../mask";
import type { ValueKind } from "../types";

const URL_SHAPE = /^https?:\/\/[^\s/]+/i;
const DOMAIN_SHAPE = /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i;
const PATH_SHAPE = /^(?:\/|~\/|\.\/|[A-Za-z]:\\)\S*$/;
const FILE_SHAPE = /^\S+\.(?:pdf|csv|xlsx?|docx?|txt|json|log|png|jpe?g|zip)$/i;
const AMOUNT_SHAPE = /^(?:[€$£]\s?)?\d{1,3}(?:[,\s]?\d{3})*(?:\.\d+)?(?:\s?(?:EUR|USD|GBP))?$/i;
const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}(?:[T ][\d:.]+Z?)?$/;
const URL_IN_TEXT = /https?:\/\/[^\s"'<>]+/gi;
const EMAIL_IN_TEXT = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

// Typed values always count. Other values count only when they look like IDs.
export const TRACED_KINDS: ReadonlySet<ValueKind> = new Set<ValueKind>([
    "iban",
    "card",
    "email",
    "url",
    "domain",
    "path",
    "id",
]);

// 8 or more characters, no spaces and at least one digit.
export function looksLikeId(value: string): boolean {
    return value.length >= 8 && !/\s/.test(value) && /\d/.test(value);
}

export function classify(value: string): ValueKind {
    const v = value.trim();
    if (isIban(v)) return "iban";
    if (isCard(v)) return "card";
    if (isEmail(v)) return "email";
    if (URL_SHAPE.test(v)) return "url";
    if (PATH_SHAPE.test(v) || FILE_SHAPE.test(v)) return "path";
    if (DOMAIN_SHAPE.test(v)) return "domain";
    // Dates and amounts are never traced on their own.
    if (DATE_SHAPE.test(v)) return "text";
    if (AMOUNT_SHAPE.test(v)) return "amount";
    if (looksLikeId(v)) return "id";
    return "text";
}

function normalizeUrl(value: string): string {
    const lowered = value.replace(/^(https?:\/\/)([^/?#]+)/i, (_, scheme: string, host: string) => {
        const cleanHost = host
            .toLowerCase()
            .replace(/^www\./, "")
            .replace(/:(80|443)$/, "");
        return scheme.toLowerCase() + cleanHost;
    });
    return lowered.replace(/#.*$/, "").replace(/\/+$/, "");
}

// Compared after normalizing case, spaces and URL form.
export function normalize(value: string, kind: ValueKind): string {
    const v = value.trim();
    switch (kind) {
        case "iban":
            return normalizeIban(v);
        case "card":
            return normalizeCard(v);
        case "email":
            return normalizeEmail(v);
        case "url":
            return normalizeUrl(v);
        case "domain":
            return v.toLowerCase().replace(/^www\./, "");
        case "path":
            return v;
        default:
            return v.toLowerCase().replace(/\s+/g, " ");
    }
}

export function hostOf(value: string, kind: ValueKind): string | null {
    const v = value.trim();
    if (kind === "url") {
        const match = v.match(/^https?:\/\/([^/?#:]+)/i);
        return match ? match[1].toLowerCase().replace(/^www\./, "") : null;
    }
    if (kind === "email") return v.slice(v.lastIndexOf("@") + 1).toLowerCase();
    if (kind === "domain") return v.toLowerCase().replace(/^www\./, "");
    return null;
}

// A short stand-in for the Public Suffix List.
const TWO_PART_SUFFIXES = new Set([
    "co.uk",
    "org.uk",
    "ac.uk",
    "com.au",
    "net.au",
    "co.nz",
    "co.jp",
    "com.br",
    "co.za",
]);

// "mail.acme.co.uk" becomes "acme.co.uk".
export function mainDomain(host: string): string {
    const parts = host.split(".");
    if (parts.length <= 2) return host;
    const lastTwo = parts.slice(-2).join(".");
    return TWO_PART_SUFFIXES.has(lastTwo) ? parts.slice(-3).join(".") : lastTwo;
}

export type FoundValue = { raw: string; kind: ValueKind };

// Typed and ID-like values inside a longer text, such as an IBAN in an email body.
export function extractValues(text: string): FoundValue[] {
    const out: FoundValue[] = [];
    const add = (raw: string, kind: ValueKind) => {
        if (raw && !out.some((found) => found.raw === raw)) out.push({ raw, kind });
    };
    let rest = text;
    for (const match of text.matchAll(URL_IN_TEXT)) {
        const url = match[0].replace(/[).,;:]+$/, "");
        add(url, "url");
        for (const part of url.replace(/^https?:\/\/[^/]+/i, "").split(/[/?&=#]+/)) {
            if (classify(part) === "id") add(part, "id");
        }
        rest = rest.split(match[0]).join(" ");
    }
    for (const match of rest.matchAll(EMAIL_IN_TEXT)) {
        add(match[0], "email");
        rest = rest.split(match[0]).join(" ");
    }
    for (const iban of findIbans(rest)) {
        add(iban, "iban");
        rest = rest.split(iban).join(" ");
    }
    for (const token of rest.split(/[\s,;()"'<>]+/)) {
        const clean = token.replace(/[.:!?]+$/, "");
        const kind = classify(clean);
        if (kind === "id" || kind === "path" || kind === "domain") add(clean, kind);
        // IDs inside a file path, such as INV-20931 in /srv/invoices/INV-20931.pdf.
        if (kind === "path") {
            for (const part of clean.split(/[/\\]+/)) {
                const stem = part.replace(/\.[a-z0-9]{1,5}$/i, "");
                if (classify(stem) === "id") add(stem, "id");
            }
        }
    }
    return out;
}
