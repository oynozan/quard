import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { serve } from "@hono/node-server";
import { openListener } from "@quard/db";
import { WebSocketServer } from "ws";
import { createApp } from "../app.ts";
import { startPings } from "../socket/ping.ts";
import { handleUpgrades } from "../socket/upgrade.ts";
import type { OpenListener } from "../watch/listen.ts";
import { startWatcher } from "../watch/watcher.ts";
import { createContext, type Context, type ContextOptions } from "./context.ts";
import { closeServer, closeSockets } from "./shutdown.ts";

// The SDK never sends more than 1 MB at once
const MAX_PAYLOAD = 1024 * 1024;

export type StartOptions = ContextOptions & {
    port: number;
    // The LISTEN connection opens its own client, so it needs the URL
    databaseUrl: string;
    listen?: OpenListener;
};

export type ControlServer = { port: number; close(): Promise<void> };

function listen(ctx: Context, port: number): Promise<Server> {
    return new Promise((resolve, reject) => {
        const server = serve({ fetch: createApp(ctx).fetch, port }, () => resolve(server)) as Server;
        server.once("error", reject);
    });
}

// The health route and the SDK's WebSocket on one port, plus the background work
export async function startControl(options: StartOptions): Promise<ControlServer> {
    const ctx = createContext(options);
    const server = await listen(ctx, options.port);
    const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD });
    handleUpgrades(ctx, server, wss);
    const stopPings = startPings(ctx.registry, ctx.timing.pingMs);
    const watcher = startWatcher(ctx, options.databaseUrl, options.listen ?? openListener);
    return {
        port: (server.address() as AddressInfo).port,
        close: async () => {
            // No new sockets from here on, a late upgrade gets 503
            wss.close();
            const serverClosed = closeServer(server);
            stopPings();
            await watcher.stop();
            await closeSockets(ctx);
            await serverClosed;
        },
    };
}
