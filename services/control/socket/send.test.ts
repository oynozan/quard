import { WebSocket } from "ws";
import { describe, expect, it } from "vitest";
import { asSocket, fakeSocket } from "../test/fake-socket.ts";
import { createRegistry } from "./registry.ts";
import { send, sendError } from "./send.ts";

function connection() {
    const socket = fakeSocket();
    return { socket, connection: createRegistry(Date.now).add(asSocket(socket), { keyId: "k", projectId: "p" }) };
}

describe("send", () => {
    it("sends JSON to an open socket", () => {
        const { socket, connection: open } = connection();

        send(open, { type: "asked", askId: "a".repeat(16), requestId: `apr_${"b".repeat(16)}` });

        expect(socket.sent).toEqual([{ type: "asked", askId: "a".repeat(16), requestId: `apr_${"b".repeat(16)}` }]);
    });

    it("drops a message for a socket that is closing", () => {
        const { socket, connection: closing } = connection();
        socket.readyState = WebSocket.CLOSING;

        send(closing, { type: "quarantine", add: [], remove: [] });

        expect(socket.sent).toEqual([]);
    });
});

describe("sendError", () => {
    it("names the request when there is one", () => {
        const { socket, connection: open } = connection();

        sendError(open, "bad_message", "wrong", "abc");
        sendError(open, "hello_required", "Send hello first");

        expect(socket.sent).toEqual([
            { type: "error", code: "bad_message", message: "wrong", id: "abc" },
            { type: "error", code: "hello_required", message: "Send hello first" },
        ]);
    });
});
