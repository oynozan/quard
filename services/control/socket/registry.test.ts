import { describe, expect, it } from "vitest";
import { asSocket, fakeSocket } from "../test/fake-socket.ts";
import { askMessage } from "../test/messages.ts";
import { createRegistry } from "./registry.ts";

const A = { keyId: "key-a", projectId: "project-a" };
const B = { keyId: "key-b", projectId: "project-b" };

function setup() {
    const clock = { now: 1_000 };
    const registry = createRegistry(() => clock.now);
    const add = (match = A) => registry.add(asSocket(fakeSocket()), match);
    return { registry, add, clock };
}

describe("connections", () => {
    it("are listed from the start and by project once ready", () => {
        const { registry, add } = setup();
        const first = add();
        const second = add();
        const other = add(B);

        expect(first).toMatchObject({ id: "", greeted: false, ready: false, closed: false, alive: true, queued: 0 });
        expect(registry.connections()).toEqual([first, second, other]);
        expect(registry.keyIds()).toEqual(["key-a", "key-b"]);
        expect(registry.withKey("key-a")).toEqual([first, second]);
        expect(registry.inProject("project-a")).toEqual([]);

        registry.ready(first);
        registry.ready(other);
        expect(first.ready).toBe(true);
        expect(registry.inProject("project-a")).toEqual([first]);
        expect(registry.projects()).toEqual(["project-a", "project-b"]);
    });

    it("leave every list when they close, and never get ready after that", () => {
        const { registry, add } = setup();
        const connection = add();
        registry.ready(connection);

        registry.remove(connection);
        registry.ready(connection);

        expect(connection).toMatchObject({ closed: true, ready: true });
        expect(registry.connections()).toEqual([]);
        expect(registry.inProject("project-a")).toEqual([]);
        expect(registry.projects()).toEqual([]);

        const late = add();
        registry.remove(late);
        registry.ready(late);
        expect(late.ready).toBe(false);
    });
});

describe("waiters", () => {
    it("wait on a request, oldest first, within their project", () => {
        const { registry, add } = setup();
        const first = add();
        const second = add();
        const other = add(B);
        const one = askMessage();
        const two = askMessage();

        registry.wait(second, two, "apr_1");
        registry.wait(first, one, "apr_1");
        registry.wait(other, askMessage(), "apr_1");

        expect(registry.waiting("project-a", "apr_1").map((waiter) => waiter.ask)).toEqual([two, one]);
        expect(registry.waiting("project-b", "apr_1")).toHaveLength(1);
        expect(registry.waiting("project-a", "apr_2")).toEqual([]);
        expect(registry.requestIds()).toEqual(["apr_1"]);
        expect(first.waiters.get(one.askId)?.requestId).toBe("apr_1");
    });

    it("move with their call and keep their place", () => {
        const { registry, add } = setup();
        const before = add();
        const after = add();
        const ask = askMessage();
        registry.wait(before, ask, "apr_1");
        registry.wait(before, askMessage(), "apr_1");

        registry.wait(after, { ...ask, requestId: "apr_1" }, "apr_2");

        expect(before.waiters.has(ask.askId)).toBe(false);
        expect(registry.waiting("project-a", "apr_1")).toHaveLength(1);
        const [moved] = registry.waiting("project-a", "apr_2");
        expect(moved).toMatchObject({ connection: after, requestId: "apr_2", since: 1, done: false });
        expect(registry.requestIds()).toEqual(["apr_1", "apr_2"]);
    });

    it("finish once, by waiter or by ask id, and go with their connection", () => {
        const { registry, add } = setup();
        const connection = add();
        const ask = askMessage();
        registry.wait(connection, ask, "apr_1");
        registry.wait(connection, askMessage(), "apr_2");
        const [waiter] = registry.waiting("project-a", "apr_1");

        registry.drop("project-a", ask.askId);
        registry.drop("project-a", "nope");
        registry.finish(waiter!);

        expect(waiter?.done).toBe(true);
        expect(registry.requestIds()).toEqual(["apr_2"]);
        registry.remove(connection);
        expect(registry.requestIds()).toEqual([]);
        expect(connection.waiters.size).toBe(0);
    });

    it("note when their call last asked or beat, on their own connection", () => {
        const { registry, add, clock } = setup();
        const connection = add();
        const other = add();
        const ask = askMessage();
        registry.wait(connection, ask, "apr_1");
        const [waiter] = registry.waiting("project-a", "apr_1");
        expect(waiter?.beatAt).toBe(1_000);

        clock.now = 2_000;
        registry.beat(other, [ask.askId]);
        expect(waiter?.beatAt).toBe(1_000);
        registry.beat(connection, [ask.askId, "nope"]);
        expect(waiter?.beatAt).toBe(2_000);

        clock.now = 3_000;
        registry.wait(other, ask, "apr_2");
        expect(registry.waiting("project-a", "apr_2")[0]?.beatAt).toBe(3_000);
    });

    it("are not kept for a connection that closed", () => {
        const { registry, add } = setup();
        const connection = add();
        registry.remove(connection);

        registry.wait(connection, askMessage(), "apr_1");

        expect(registry.requestIds()).toEqual([]);
    });
});
