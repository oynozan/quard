import { mainDomain, findHosts } from "../normalize/domain.ts";
import { emailHost, findEmails } from "../normalize/email.ts";
import { findIbans } from "../normalize/iban.ts";
import { findIds } from "../normalize/identifier.ts";
import { findPaths } from "../normalize/path.ts";
import { cleanText } from "../normalize/text.ts";
import { findUrls, urlHost } from "../normalize/url.ts";
import { removeSecrets } from "../redact/secrets.ts";

export type ValueType = "iban" | "email" | "url" | "host" | "path" | "id" | "wallet";

// A traceable value and the index keys it can match on
export type ExtractedValue = {
    type: ValueType;
    value: string;
    keys: string[];
};

// An EVM address: 0x and 40 hex digits. Public on chain, so kept in clear.
const EVM_ADDRESS = /(?<![\w])0x[0-9a-fA-F]{40}(?![\w])/g;

function hostKeys(host: string): string[] {
    const domain = mainDomain(host);
    return domain === undefined ? [`host:${host}`] : [`host:${host}`, `domain:${domain}`];
}

// Finds every traceable value in a text, normalized
export function extractValues(text: string): ExtractedValue[] {
    // Runs of spaces count as one, so a spaced-out IBAN still matches
    const clean = cleanText(text).replace(/[ \t]+/g, " ");
    const found = new Map<string, ExtractedValue>();
    const add = (type: ValueType, value: string, keys: string[]) => {
        if (!found.has(`${type}:${value}`)) {
            found.set(`${type}:${value}`, { type, value, keys });
        }
    };
    // Hosts of emails and URLs, and IBANs, are not listed a second time
    const covered = new Set<string>();
    for (const iban of findIbans(clean)) {
        add("iban", iban, [`iban:${iban}`]);
        covered.add(iban.toLowerCase());
    }
    for (const email of findEmails(clean)) {
        add("email", email, [`email:${email}`, ...hostKeys(emailHost(email))]);
        covered.add(emailHost(email));
    }
    for (const url of findUrls(clean)) {
        add("url", url, [`url:${url}`, ...hostKeys(urlHost(url))]);
        covered.add(urlHost(url));
    }
    for (const host of findHosts(clean).filter((host) => !covered.has(host))) add("host", host, hostKeys(host));
    for (const path of findPaths(clean)) add("path", path, [`path:${path}`]);
    for (const [match] of clean.matchAll(EVM_ADDRESS)) {
        const wallet = match.toLowerCase();
        add("wallet", wallet, [`wallet:${wallet}`]);
        covered.add(wallet);
    }
    // A secret is no ID: its key would carry it past redaction
    for (const id of findIds(removeSecrets(clean)).filter((id) => !covered.has(id))) add("id", id, [`id:${id}`]);
    return [...found.values()];
}
