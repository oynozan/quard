import { connect, createAgentKey, createProject, type AgentKeyMatch, type Db } from "@quard/db";
import { hello } from "../connect/hello.ts";
import { createContext, type Context, type ContextOptions } from "../server/context.ts";
import type { Connection } from "../socket/registry.ts";
import { asSocket, fakeSocket, type FakeSocket } from "./fake-socket.ts";
import { helloMessage, REDACTOR } from "./messages.ts";

export type TestProject = AgentKeyMatch & { key: string };

// Every query fails on this one, as when Postgres is down
export const BROKEN_URL = "postgres://nobody@127.0.0.1:1/none";

export function brokenDb(): Db {
    return connect(BROKEN_URL, 1);
}

// Updates of one table fail and every other query works, on the same pool
export function failingUpdates(db: Db, table: string): Db {
    return db.withPlugin({
        transformQuery: ({ node }) => {
            if (node.kind === "UpdateQueryNode" && JSON.stringify(node).includes(`"name":"${table}"`)) {
                throw new Error(`updates of ${table} fail in this test`);
            }
            return node;
        },
        transformResult: async ({ result }) => result,
    });
}

export function testContext(db: Db, options: Partial<ContextOptions> = {}): Context & { logs: string[] } {
    const logs: string[] = [];
    const ctx = createContext({ db, redactor: REDACTOR, log: (message) => logs.push(message), ...options });
    return Object.assign(ctx, { logs });
}

export async function newProject(db: Db, name = "Acme"): Promise<TestProject> {
    const projectId = await createProject(db, name);
    const created = await createAgentKey(db, projectId, "billing");
    return { projectId, keyId: created.id, key: created.key };
}

export type TestConnection = { connection: Connection; socket: FakeSocket };

// A connection that has not said hello yet
export function newConnection(ctx: Context, project: AgentKeyMatch): TestConnection {
    const socket = fakeSocket();
    return { connection: ctx.registry.add(asSocket(socket), project), socket };
}

// A connection that said hello and got ready
export async function readyConnection(ctx: Context, project: AgentKeyMatch): Promise<TestConnection> {
    const made = newConnection(ctx, project);
    made.connection.greeted = true;
    await hello(ctx, made.connection, helloMessage());
    if (!made.connection.ready) {
        throw new Error("hello failed in a test setup");
    }
    return made;
}
