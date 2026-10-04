import { CUT } from "./masks.ts";
import type { Span } from "./spans.ts";

export type SecretSpan = Span & { name: string };

// Line breaks inside a private key, real or written as \n in JSON text
const BREAKS = String.raw`(?:[ \t]*(?:\r?\n|(?:\\r)?\\n))+[ \t]*`;
// A whole line of base64, or a PEM header such as Proc-Type
const KEY_LINE = String.raw`(?:[A-Za-z0-9+/=]+(?=[ \t]*(?:[\r\n"'\\]|$))|(?:Proc-Type|DEK-Info):[ \w,-]*)`;
// A private key needs its END line, or stops where its base64 lines
// end, so text after a lone BEGIN line stays
const PRIVATE_KEY = new RegExp(
    `-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----(?:${BREAKS}${KEY_LINE})*(?:${BREAKS}-----END (?:[A-Z]+ )*PRIVATE KEY-----)?`,
    "g",
);

// Gitleaks-style patterns for common keys and tokens. Each starts
// with a fixed prefix, so the scan stays linear.
const PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
    // The user and password in scheme://user:pass@host. As URL parsers
    // read it, the host starts after the last @ and the password after
    // the first :, so both may hold an @. Both stop at a quote, a comma
    // or a URL delimiter, so the match never leaves the URL. Known limit:
    // a password with a quote or comma is not found. First, so it wins
    // over a token that starts in the same place.
    ["url-credentials", /(?<=:\/\/)[^\s/?#"'`<>\\:,]*:[^\s/?#"'`<>\\,]*(?=@)/g],
    ["quard-agent-key", /\bqk_(?:live|test)_[A-Za-z0-9]{16,}/g],
    ["sk-api-key", /\bsk-(?:proj-|svcacct-|admin-|ant-)?[A-Za-z0-9_-]{20,}/g],
    ["aws-access-key", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g],
    ["github-token", /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})/g],
    ["slack-token", /\bxox[abprs]-[A-Za-z0-9-]{10,}/g],
    ["google-api-key", /\bAIza[0-9A-Za-z_-]{35}/g],
    ["stripe-key", /\b(?:sk|rk)_(?:live|test)_[0-9A-Za-z]{16,}/g],
    ["private-key", PRIVATE_KEY],
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

// A Cookie value is name=value pairs, so free text after the word stays
const PAIR = String.raw`[^\s=;,"'\\]+=[^\s;,"'\\]*`;
const COOKIE = new RegExp(
    String.raw`\b((?:set-)?cookie)(["']?\s{0,3}[:=]\s{0,3}\[?["']?)(${PAIR}(?:;[ \t]?${PAIR})*)`,
    "gi",
);

// An Authorization value is a scheme and one long token, such as Basic
// auth, or the token alone, so "authorization: please pay" stays.
// Bearer tokens keep their "Bearer" word.
const AUTH =
    /\b((?:proxy-)?authorization)(["']?\s{0,3}[:=]\s{0,3}["']?)(?!bearer\s)((?:[A-Za-z][\w-]*[ \t]+)?[\w.~+/-]{12,}=*)/gi;

// Fields whose whole value is removed, whatever it holds, such as
// password, client_secret, x-api-key, cookies or access_token. "token"
// counts alone, after a _ or -, or after a word such as access or
// session, so sellToken and input_tokens stay.
export const SECRET_FIELD =
    /^(?:[\w-]{0,40}?(?:password|passwd|pwd|secret|api[_-]?key|authorization|cookie)s?|(?:[\w-]{0,40}?(?:access|refresh|auth|session|csrf|xsrf|api|bearer|bot|security)|(?:[\w-]{0,40}?[_-])?id)[_-]?tokens?|(?:[\w-]{0,40}?[_-])?token|tokens)$/i;

// Secrets found by their name, such as password=..., a Bearer token or a
// Cookie header, from the name to the end of the value
export function findNamedSecrets(text: string): Span[] {
    return [BEARER, ASSIGNED, COOKIE, AUTH].flatMap((pattern) =>
        [...text.matchAll(pattern)].map((match) => ({
            start: match.index,
            end: match.index + match[0].length,
            value: match[0],
        })),
    );
}

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
        .replace(COOKIE, `$1$2${CUT}`)
        .replace(AUTH, `$1$2${CUT}`);
}
