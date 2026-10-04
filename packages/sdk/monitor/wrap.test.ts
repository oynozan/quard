import { afterEach, describe, expect, it, vi } from "vitest";
import { wrap } from "./wrap.ts";

type FakeClient = {
    fetch: typeof fetch | undefined;
    withOptions: (options: { fetch?: typeof fetch; timeout?: number }) => FakeClient;
};

// Like the OpenAI client, a copy keeps the fetch unless it is given one
function fakeClient(inner?: typeof fetch): FakeClient {
    return { fetch: inner, withOptions: (options) => fakeClient(options.fetch ?? inner) };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("wrap", () => {
    it("gives the client a fetch that runs through the monitor", async () => {
        const inner = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response("ok"));

        const wrapped = wrap(fakeClient(inner));
        await wrapped.fetch?.("https://api.openai.com/v1/models");

        expect(wrapped.fetch).not.toBe(inner);
        expect(inner).toHaveBeenCalledWith("https://api.openai.com/v1/models", undefined);
    });

    it("leaves a wrapped client as it is, so calls are not recorded twice", () => {
        const wrapped = wrap(fakeClient(vi.fn()));

        expect(wrap(wrapped)).toBe(wrapped);
    });

    it("leaves a copy of a wrapped client as it is, since it keeps the monitor", async () => {
        const inner = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response("ok"));
        const derived = wrap(fakeClient(inner)).withOptions({ timeout: 30_000 });

        const again = wrap(derived);

        expect(again).toBe(derived);
        expect(again.fetch).toBe(derived.fetch);
    });

    it("falls back to the global fetch", async () => {
        const global = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok"));

        await wrap(fakeClient()).fetch?.("https://example.com");

        expect(global).toHaveBeenCalled();
    });
});
