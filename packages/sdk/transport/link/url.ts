import { CONTROL_PATH } from "@quard/shared";

const SOCKET_PROTOCOLS: Record<string, string> = { "http:": "ws:", "https:": "wss:", "ws:": "ws:", "wss:": "wss:" };

// The WebSocket address for a controlUrl, where http becomes ws and https wss
export function controlSocketUrl(controlUrl: string): string {
    const url = URL.canParse(controlUrl) ? new URL(controlUrl) : undefined;
    const protocol = url && SOCKET_PROTOCOLS[url.protocol];
    if (url === undefined || protocol === undefined) {
        throw new Error("controlUrl must be an http, https, ws or wss URL");
    }
    return `${protocol}//${url.host}${url.pathname.replace(/\/+$/, "")}${CONTROL_PATH}`;
}
