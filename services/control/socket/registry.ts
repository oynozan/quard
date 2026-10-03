import type { AgentKeyMatch } from "@quard/db";
import type { AskMessage } from "@quard/shared";
import type { WebSocket } from "ws";
import { createGroups } from "./groups.ts";

export type Connection = {
    socket: WebSocket;
    keyId: string;
    projectId: string;
    // The sdk_connections row, empty until hello is stored
    id: string;
    // A valid hello arrived
    greeted: boolean;
    // Ready was sent, so the connection gets quarantine pushes
    ready: boolean;
    closed: boolean;
    // Answered the last ping
    alive: boolean;
    // The calls waiting here, by ask id
    waiters: Map<string, Waiter>;
    // The quarantine list as this SDK has it, key to observe flag
    known: Map<string, boolean>;
    // Messages are handled one at a time, in order
    queue: Promise<void>;
    // Messages received and not handled yet
    queued: number;
};

export type Waiter = {
    connection: Connection;
    // Kept whole, so the call can ask again with a new request
    ask: AskMessage;
    requestId: string;
    // Order among the calls waiting on one request
    since: number;
    // When the call last asked or beat, in ms
    beatAt: number;
    done: boolean;
};

export type Registry = {
    add(socket: WebSocket, match: AgentKeyMatch): Connection;
    // Hello is done, so the connection gets pushes from now on
    ready(connection: Connection): void;
    // The socket closed, so its calls stop waiting here but their rows stay
    remove(connection: Connection): void;
    connections(): Connection[];
    inProject(projectId: string): Connection[];
    projects(): string[];
    withKey(keyId: string): Connection[];
    keyIds(): string[];
    // The same call waiting anywhere else moves here
    wait(connection: Connection, ask: AskMessage, requestId: string): void;
    // The calls waiting on a request, oldest first
    waiting(projectId: string, requestId: string): Waiter[];
    requestIds(): string[];
    // The calls that are still waiting on this connection
    beat(connection: Connection, askIds: string[]): void;
    finish(waiter: Waiter): void;
    // Ends the wait of a call, wherever it waits
    drop(projectId: string, askId: string): void;
};

// Every SDK connection of this control instance and the calls waiting on them
export function createRegistry(now: () => number): Registry {
    const all = new Set<Connection>();
    const projects = createGroups<Connection>();
    const requests = createGroups<Waiter>();
    const asks = new Map<string, Waiter>();
    let order = 0;

    const askKey = (projectId: string, askId: string) => `${projectId}/${askId}`;

    function finish(waiter: Waiter): void {
        if (waiter.done) {
            return;
        }
        waiter.done = true;
        asks.delete(askKey(waiter.connection.projectId, waiter.ask.askId));
        waiter.connection.waiters.delete(waiter.ask.askId);
        requests.delete(waiter.requestId, waiter);
    }

    function add(socket: WebSocket, match: AgentKeyMatch): Connection {
        const connection: Connection = {
            socket,
            keyId: match.keyId,
            projectId: match.projectId,
            id: "",
            greeted: false,
            ready: false,
            closed: false,
            alive: true,
            waiters: new Map(),
            known: new Map(),
            queue: Promise.resolve(),
            queued: 0,
        };
        all.add(connection);
        return connection;
    }

    function wait(connection: Connection, ask: AskMessage, requestId: string): void {
        if (connection.closed) {
            return;
        }
        const key = askKey(connection.projectId, ask.askId);
        const before = asks.get(key);
        if (before !== undefined) {
            finish(before);
        }
        order += 1;
        const since = before?.since ?? order;
        const waiter: Waiter = { connection, ask, requestId, since, beatAt: now(), done: false };
        asks.set(key, waiter);
        connection.waiters.set(ask.askId, waiter);
        requests.add(requestId, waiter);
    }

    return {
        add,
        ready: (connection) => {
            if (!connection.closed) {
                connection.ready = true;
                projects.add(connection.projectId, connection);
            }
        },
        remove: (connection) => {
            connection.closed = true;
            all.delete(connection);
            projects.delete(connection.projectId, connection);
            [...connection.waiters.values()].forEach(finish);
        },
        connections: () => [...all],
        inProject: (projectId) => projects.get(projectId),
        projects: () => projects.keys(),
        withKey: (keyId) => [...all].filter((connection) => connection.keyId === keyId),
        keyIds: () => [...new Set([...all].map((connection) => connection.keyId))],
        wait,
        waiting: (projectId, requestId) =>
            requests
                .get(requestId)
                .filter((waiter) => waiter.connection.projectId === projectId)
                .sort((a, b) => a.since - b.since),
        requestIds: () => requests.keys(),
        beat: (connection, askIds) => {
            const at = now();
            for (const askId of askIds) {
                const waiter = connection.waiters.get(askId);
                if (waiter !== undefined) {
                    waiter.beatAt = at;
                }
            }
        },
        finish,
        drop: (projectId, askId) => {
            const waiter = asks.get(askKey(projectId, askId));
            if (waiter !== undefined) {
                finish(waiter);
            }
        },
    };
}
