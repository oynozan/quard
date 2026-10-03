// True when the request comes from this site, which stops forged requests from other pages
export function sameOrigin(headers: Headers): boolean {
    const origin = headers.get("origin");
    // Behind a chain of proxies the forwarded host can list several values, and the first is the public one
    const host = (headers.get("x-forwarded-host") ?? headers.get("host"))?.split(",")[0].trim();
    if (!origin || !host) return false;
    try {
        return new URL(origin).host === host;
    } catch {
        return false;
    }
}
