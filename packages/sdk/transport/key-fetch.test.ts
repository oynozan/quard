import { HASH_KEY_PATH } from "@quard/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { forgetProjectKey, learnProjectKey, projectKey, projectRedactor } from "../core/project-key.ts";
import { PROJECT_KEY, PROJECT_KEY_TEXT, projectKeyOf } from "../test/hash-key.ts";
import { createKeyFetch } from "./key-fetch.ts";
import type { Send } from "./uploader.ts";

type Answer = number | "down" | "silent" | Response;

// A webhook stand-in that answers each key request in turn
function webhook(...answers: Answer[]) {
    const asked: Array<{ url: string; init: RequestInit }> = [];
    const send = vi.fn<Send>(async (url, init) => {
        asked.push({ url, init });
        const answer = answers.length > 1 ? answers.shift() : answers[0];
        if (answer === "down") {
            throw new Error("connection refused");
        }
        if (answer === "silent") {
            // Never answers, so only the timeout ends the wait
            return new Promise((_resolve, reject) =>
                init.signal?.addEventListener("abort", () => reject(new Error("x"))),
            );
        }
        if (answer instanceof Response) {
            return answer;
        }
        const status = answer ?? 200;
        const body = status === 200 ? { hashKey: PROJECT_KEY_TEXT } : { error: "invalid_agent_key" };
        return new Response(JSON.stringify(body), { status });
    });
    return { asked, send };
}

function keys(send: Send, warn = vi.fn(), timeoutMs?: number) {
    return createKeyFetch({ webhookUrl: "http://webhook.test/", key: "qk_live_abc", send, warn, timeoutMs });
}

afterEach(() => {
    forgetProjectKey();
});

describe("createKeyFetch", () => {
    it("asks webhook for the project's key with the agent key, and redacts with it", async () => {
        const hook = webhook(200);

        const redactor = await keys(hook.send).redactor();

        expect(redactor).toBe(projectRedactor());
        expect(projectKey()).toEqual(PROJECT_KEY);
        expect(hook.asked).toEqual([
            {
                url: `http://webhook.test${HASH_KEY_PATH}`,
                init: expect.objectContaining({ method: "GET", headers: { authorization: "Bearer qk_live_abc" } }),
            },
        ]);
    });

    it("asks only while the key is unknown, once for calls that overlap", async () => {
        const hook = webhook(200);
        const fetch = keys(hook.send);

        await Promise.all([fetch.redactor(), fetch.redactor()]);
        await fetch.redactor();

        expect(hook.asked).toHaveLength(1);
    });

    it("asks nothing once control handed out the key", async () => {
        const hook = webhook(200);
        learnProjectKey(PROJECT_KEY_TEXT);

        expect(await keys(hook.send).redactor()).toBe(projectRedactor());
        expect(hook.asked).toEqual([]);
    });

    it("has no key while webhook can't be reached, and asks again on the next call", async () => {
        const hook = webhook("down", 503, 200);
        const fetch = keys(hook.send);

        expect(await fetch.redactor()).toBeUndefined();
        expect(await fetch.redactor()).toBeUndefined();
        expect(await fetch.redactor()).toBe(projectRedactor());
        expect(hook.asked).toHaveLength(3);
    });

    it("gives up on a webhook that does not answer in time", async () => {
        expect(await keys(webhook("silent").send, vi.fn(), 20).redactor()).toBeUndefined();
    });

    it("warns once per status when webhook refuses for good, but keeps asking", async () => {
        const warn = vi.fn();
        const fetch = keys(webhook(401, 401, 404, 429).send, warn);

        for (let call = 0; call < 4; call += 1) {
            expect(await fetch.redactor()).toBeUndefined();
        }

        expect(warn.mock.calls).toEqual([
            [expect.stringContaining("refused to hand out the hash key (401)")],
            [expect.stringContaining("(404)")],
        ]);
        expect(projectKey()).toBeUndefined();
    });

    it("takes no key from an answer it can't read", async () => {
        const unreadable = new Response("not json", { status: 200 });
        const wrong = new Response(JSON.stringify({ hashKey: "AB".repeat(32) }), { status: 200 });

        const fetch = keys(webhook(unreadable, wrong).send);

        expect(await fetch.redactor()).toBeUndefined();
        expect(await fetch.redactor()).toBeUndefined();
    });

    it("hands out nothing once stopped, and ignores an answer still on its way", async () => {
        let answer: (res: Response) => void = () => {};
        const send = vi.fn<Send>(() => new Promise((resolve) => (answer = resolve)));
        const fetch = keys(send);

        const asked = fetch.redactor();
        fetch.stop();
        answer(new Response(JSON.stringify({ hashKey: projectKeyOf("old") }), { status: 200 }));

        expect(await asked).toBeUndefined();
        expect(projectKey()).toBeUndefined();
        learnProjectKey(PROJECT_KEY_TEXT);
        expect(await fetch.redactor()).toBeUndefined();
        expect(send).toHaveBeenCalledTimes(1);
    });

    it("uses fetch and console.warn by default", async () => {
        const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 403 }));
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

        expect(await createKeyFetch({ webhookUrl: "http://webhook.test", key: "k" }).redactor()).toBeUndefined();

        expect(fetch).toHaveBeenCalledWith(`http://webhook.test${HASH_KEY_PATH}`, expect.any(Object));
        expect(warn).toHaveBeenCalledWith(expect.stringContaining("(403)"));
        fetch.mockRestore();
        warn.mockRestore();
    });
});
