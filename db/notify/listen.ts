import pg from "pg";
import { CHANNELS, type Channel } from "./channels.ts";

export type Notice = { channel: Channel; payload: string };

export type Listener = {
    // The connection itself. Tests emit "notification" on it.
    client: pg.Client;
    close(): Promise<void>;
};

// Idle time before the first keepalive probe
export const KEEPALIVE_MS = 10_000;

const NAMES = new Set<string>(Object.values(CHANNELS));
const LISTEN_ALL = Object.values(CHANNELS)
    .map((channel) => `LISTEN ${channel};`)
    .join(" ");

// A connection of its own that hears every Quard channel. LISTEN belongs to
// one connection, so it never comes from the pool. `lost` runs once if the
// connection fails later; the caller then opens a new listener.
export async function openListener(
    url: string,
    heard: (notice: Notice) => void,
    lost: (error: Error) => void,
): Promise<Listener> {
    // Keepalive notices a dropped connection that sits idle between
    // notifications, within seconds instead of the OS default of hours
    const client = new pg.Client({
        connectionString: url,
        keepAlive: true,
        keepAliveInitialDelayMillis: KEEPALIVE_MS,
    });
    let open = false;
    const drop = (error: Error) => {
        if (open) {
            open = false;
            lost(error);
        }
    };
    client.on("notification", (message) => {
        if (NAMES.has(message.channel)) {
            heard({ channel: message.channel as Channel, payload: message.payload ?? "" });
        }
    });
    client.on("error", drop);
    client.on("end", () => drop(new Error("The listen connection closed")));
    // A failed connect leaves nothing open
    await client.connect();
    try {
        await client.query(LISTEN_ALL);
    } catch (error) {
        await client.end();
        throw error;
    }
    open = true;
    return {
        client,
        close: async () => {
            open = false;
            await client.end();
        },
    };
}
