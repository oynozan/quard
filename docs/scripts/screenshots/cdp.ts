export type Socket = {
    addEventListener(type: string, listener: (event: { data?: unknown }) => void): void;
    send(data: string): void;
    close(): void;
};

export type Cdp = {
    send<T>(method: string, params?: object): Promise<T>;
    close(): void;
};

type Reply = { id?: number; result?: unknown; error?: { message: string } };
type Waiter = { resolve: (value: unknown) => void; reject: (error: Error) => void };

// A minimal Chrome DevTools Protocol client: each request waits for its own answer
export async function connect(url: string, open: (url: string) => Socket = (u) => new WebSocket(u)): Promise<Cdp> {
    const socket = open(url);
    await new Promise<void>((resolve, reject) => {
        socket.addEventListener("open", () => resolve());
        socket.addEventListener("error", () => reject(new Error(`Could not connect to ${url}`)));
    });
    const waiting = new Map<number, Waiter>();
    let next = 0;
    socket.addEventListener("message", (event) => {
        const reply = JSON.parse(String(event.data)) as Reply;
        const id = reply.id ?? -1;
        const waiter = waiting.get(id);
        if (!waiter) return;
        waiting.delete(id);
        if (reply.error) waiter.reject(new Error(reply.error.message));
        else waiter.resolve(reply.result);
    });
    return {
        send<T>(method: string, params: object = {}) {
            next += 1;
            const id = next;
            return new Promise<T>((resolve, reject) => {
                waiting.set(id, { resolve: (value) => resolve(value as T), reject });
                socket.send(JSON.stringify({ id, method, params }));
            });
        },
        close: () => socket.close(),
    };
}
