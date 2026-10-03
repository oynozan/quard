import { randomBytes } from "node:crypto";
import { connect, type Socket } from "node:net";
import { CONTROL_PATH } from "@quard/shared";

// A WebSocket client that completes the handshake, then never reads or answers a frame
export function silentClient(port: number, key: string): Promise<Socket> {
    return new Promise((resolve, reject) => {
        const socket = connect(port, "127.0.0.1", () => {
            const request = [
                `GET ${CONTROL_PATH} HTTP/1.1`,
                `Host: 127.0.0.1:${port}`,
                "Upgrade: websocket",
                "Connection: Upgrade",
                `Sec-WebSocket-Key: ${randomBytes(16).toString("base64")}`,
                "Sec-WebSocket-Version: 13",
                `Authorization: Bearer ${key}`,
            ];
            socket.write(`${request.join("\r\n")}\r\n\r\n`);
        });
        socket.once("data", (data) => {
            socket.pause();
            if (String(data).startsWith("HTTP/1.1 101")) {
                resolve(socket);
            } else {
                reject(new Error(String(data)));
            }
        });
        socket.once("error", reject);
    });
}
