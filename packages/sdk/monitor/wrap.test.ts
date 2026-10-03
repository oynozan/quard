import { afterEach, describe, expect, it, vi } from "vitest";
import { wrap } from "./wrap.ts";

type FakeClient = {
    fetch: typeof fetch | undefined;
    withOptions: (options: { fetch: typeof fetch }) => FakeClient;
};

function fakeClient(inner?: typeof fetch): FakeClient {
    return { fetch: inner, withOptions: (options) => fakeClient(options.fetch) };
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

    it("falls back to the global fetch", async () => {
        const global = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok"));

        await wrap(fakeClient()).fetch?.("https://example.com");

        expect(global).toHaveBeenCalled();
    });
});
