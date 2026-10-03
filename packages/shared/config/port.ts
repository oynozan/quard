// Reads a TCP port from an environment value
export function readPort(value: string | undefined, fallback: number): number {
    if (value === undefined || value === "") {
        return fallback;
    }
    const port = Number(value);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`Invalid port: ${value}`);
    }
    return port;
}
