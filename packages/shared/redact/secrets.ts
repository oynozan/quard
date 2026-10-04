import { CUT } from "./masks.ts";
import type { Span } from "./spans.ts";

export type SecretSpan = Span & { name: string };

// Gitleaks-style patterns for common keys and tokens. Each starts
// with a fixed prefix, so the scan stays linear.
const PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
    // The user and password in scheme://user:pass@host. The host starts
    // after the last @, as URL parsers read it. First, so it wins over a
    // token that starts in the same place.
    ["url-credentials", /(?<=:\/\/)[^\s/?#@:"'`<>\\]*:[^\s/?#"'`<>\\]*(?=@)/g],
    ["quard-agent-key", /\bqk_(?:live|test)_[A-Za-z0-9]{16,}/g],
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

// A key's known prefix stays visible, so people can tell keys apart
const PREFIX =
    /^((?:qk_(?:live|test)_|sk-(?:proj-|svcacct-|admin-|ant-)?|(?:sk|rk)_(?:live|test)_|gh[pousr]_|github_pat_|xox[abprs]-|AKIA|ASIA|AIza|eyJ)?)[\s\S]*$/;
const BEARER = /\b(Bearer\s+)[\w.~+/-]{12,}=*/gi;

// password=..., "api_key": "...", refresh_token=... and the like. The
// name stays. The name's prefix is bounded, so the scan stays linear.
const ASSIGNED =
    /\b([\w-]{0,40}?(?:password|passwd|pwd|secret|api[_-]?key|token))(["']?\s{0,3}[:=]\s{0,3}["']?)([^\s"'&,;]{6,})/gi;

// Cookie and Authorization values, such as Basic auth, go whole.
// Bearer tokens keep their "Bearer" word.
const HEADER =
    /\b((?:set-)?cookie|(?:proxy-)?authorization)(["']?\s{0,3}[:=]\s{0,3}["']?)(?!\s|bearer\s)([^"'\r\n]{6,})/gi;

// Fields whose whole value is removed, whatever it holds, such as
// password, client_secret, sessionToken or x-api-key
export const SECRET_FIELD = /^[\w-]{0,40}?(password|passwd|pwd|secret|api[_-]?key|token|authorization|cookie)$/i;

// Removes secrets before text is stored. A key keeps only its known
// prefix ("sk-proj-…"); a private key becomes "[private key]".
export function removeSecrets(text: string): string {
    let out = "";
    let last = 0;
    for (const span of findSecrets(text).sort((a, b) => a.start - b.start)) {
        // When finds overlap, the one that starts first is removed whole
        if (span.start < last) {
            continue;
        }
        const shown = span.name === "private-key" ? "[private key]" : span.value.replace(PREFIX, `$1${CUT}`);
        out += text.slice(last, span.start) + shown;
        last = span.end;
    }
    return (out + text.slice(last))
        .replace(BEARER, `$1${CUT}`)
        .replace(ASSIGNED, `$1$2${CUT}`)
        .replace(HEADER, `$1$2${CUT}`);
}
