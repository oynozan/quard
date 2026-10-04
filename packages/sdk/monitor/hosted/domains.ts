// Quard's allow patterns as API domains: "*.acme.com" becomes "acme.com"
function bare(pattern: string): string {
    return pattern.replace(/^\*\./, "").toLowerCase();
}

// An API domain also covers its subdomains
function covers(outer: string, inner: string): boolean {
    return inner === outer || inner.endsWith(`.${outer}`);
}

// Domains both lists allow: the narrower one of each overlapping pair
function overlap(a: readonly string[], b: readonly string[]): string[] {
    const fromA = a.filter((x) => b.some((y) => covers(y, x)));
    const fromB = b.filter((y) => a.some((x) => covers(x, y)));
    return [...new Set([...fromA, ...fromB])];
}

// The allowed_domains a web search may use, or undefined to leave it.
// Each allowlist narrows the app's own list. When nothing is left,
// Quard's list wins, since the search could only reach blocked sites.
export function allowedDomains(current: unknown, allowlists: readonly string[][]): string[] | undefined {
    if (allowlists.length === 0) {
        return undefined;
    }
    let domains = Array.isArray(current)
        ? current.filter((item): item is string => typeof item === "string").map((item) => item.toLowerCase())
        : undefined;
    for (const list of allowlists) {
        const rule = [...new Set(list.map(bare))];
        const both = domains === undefined ? rule : overlap(domains, rule);
        domains = both.length > 0 ? both : rule;
    }
    return domains;
}
