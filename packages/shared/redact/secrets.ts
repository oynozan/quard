import { CUT } from "./masks.ts";

// Key shapes in the style of gitleaks. Group 1 is a known prefix that
// stays visible, so people can tell keys apart; the rest is removed.
const KEYS: RegExp[] = [
    /\b(qk_(?:live|test)_)[a-z0-9]{16,}/gi,
    /\b(sk-ant-)[\w-]{20,}/g,
    /\b(sk-(?:proj-|svcacct-|admin-)?)[\w-]{20,}/g,
    /\b((?:sk|rk)_(?:live|test)_)\w{16,}/g,
    /\b(gh[pousr]_)[A-Za-z0-9]{30,}/g,
    /\b(github_pat_)\w{22,}/g,
    /\b(xox[abprs]-)[\w-]{10,}/g,
    /\b(AKIA|ASIA)[A-Z0-9]{16}\b/g,
    /\b(AIza)[\w-]{35}/g,
    /\b(eyJ)[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/g,
];

const PRIVATE_KEY = /-----BEGIN [A-Z ]{0,40}PRIVATE KEY-----[\s\S]*?-----END [A-Z ]{0,40}PRIVATE KEY-----/g;
const BEARER = /\b(Bearer\s+)[\w.~+/-]{12,}=*/gi;

// password=..., "api_key": "..." and the like. The name stays.
const ASSIGNED =
    /\b(password|passwd|pwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|token)(["']?\s{0,3}[:=]\s{0,3}["']?)([^\s"'&,;]{6,})/gi;

// Fields whose whole value is removed, whatever it holds
export const SECRET_FIELD =
    /^(password|passwd|pwd|secret|client[_-]?secret|api[_-]?key|access[_-]?token|refresh[_-]?token|auth[_-]?token|token|authorization|cookie)$/i;

export function removeSecrets(text: string): string {
    let out = text.replace(PRIVATE_KEY, "[private key]");
    for (const pattern of KEYS) {
        out = out.replace(pattern, `$1${CUT}`);
    }
    return out.replace(BEARER, `$1${CUT}`).replace(ASSIGNED, `$1$2${CUT}`);
}
