const HASHED = /^[a-z]+:(.*)#([0-9a-f]{32})$/;

// "iban:DE89…3000#<hash>" gives the mask and the hash. Domain and wallet
// keys such as "domain:acme.com" are kept in clear, so they have no hash.
export function splitFleetKey(key: string): { value: string; hash: string | null } {
    const hashed = HASHED.exec(key);
    if (hashed !== null) {
        return { value: String(hashed[1]), hash: String(hashed[2]) };
    }
    return { value: key.slice(key.indexOf(":") + 1), hash: null };
}
