const BASE = "http://quard.invalid";

// After sign-in people return only to a page on this site, so a crafted link cannot send them elsewhere.
export function safeNext(next: string | null | undefined): string {
    if (!next || !next.startsWith("/")) return "/";
    // Backslashes and control characters can turn a path into another host in some browsers.
    if (/[\\\u0000-\u001f\u007f]/.test(next)) return "/";
    // A path starting with "/" always parses against a valid base.
    const url = new URL(next, BASE);
    if (url.origin !== BASE) return "/";
    // Dot segments such as "/.//evil.com" resolve to "//evil.com", which a browser reads as a host.
    const path = url.pathname.replace(/^\/+/, "/");
    if (path === "/sign-in" || path.startsWith("/sign-in/") || path.startsWith("/api/")) return "/";
    return `${path}${url.search}${url.hash}`;
}
