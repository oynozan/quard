import type { Span } from "./spans.ts";

export type SecretSpan = Span & { name: string };

// Gitleaks-style patterns for common keys and tokens. Each starts
// with a fixed prefix, so the scan stays linear.
const PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
    ["sk-api-key", /\bsk-(?:proj-|svcacct-|admin-|ant-)?[A-Za-z0-9_-]{20,}/g],
    ["aws-access-key", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g],
    ["github-token", /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})/g],
    ["slack-token", /\bxox[abprs]-[A-Za-z0-9-]{10,}/g],
    ["google-api-key", /\bAIza[0-9A-Za-z_-]{35}/g],
    ["stripe-key", /\b(?:sk|rk)_(?:live|test)_[0-9A-Za-z]{16,}/g],
    ["private-key", /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----[\s\S]*?(?:-----END (?:[A-Z]+ )*PRIVATE KEY-----|$)/g],
    ["jwt", /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g],
];

export const SECRET_MASK = "[secret removed by Quard]";

export function findSecrets(text: string): SecretSpan[] {
    return PATTERNS.flatMap(([name, pattern]) =>
        [...text.matchAll(pattern)].map((match) => ({
            name,
            start: match.index,
            end: match.index + match[0].length,
            value: match[0],
        })),
    );
}
