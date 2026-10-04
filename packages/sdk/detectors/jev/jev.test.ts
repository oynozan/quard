import { afterEach, describe, expect, it, vi } from "vitest";
import { LABEL_NAMES } from "../labels.ts";
import { JEV_MODEL, jevDetector } from "./jev.ts";

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

type Reply = Response | Error | ((init: RequestInit) => Promise<Response>);

// Stubs fetch with the given replies in turn; the last one repeats
function answers(...replies: Reply[]) {
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
        const next = (replies.length > 1 ? replies.shift() : replies[0]) as Reply;
        if (next instanceof Error) {
            throw next;
        }
        return typeof next === "function" ? next(init) : next.clone();
    });
    vi.stubGlobal("fetch", fetch);
    return fetch;
}

// Chances for every label: most for `choice`, the rest on one other
function chancesFor(choice: string): Record<string, number> {
    const rest = choice === "none" ? "article" : "none";
    return Object.fromEntries(LABEL_NAMES.map((name) => [name, name === choice ? 0.9 : name === rest ? 0.1 : 0]));
}

// A reply as Jev's API sends it. `injection` is the yes or no answer.
function jevReply(
    choice: string,
    { model = JEV_MODEL, probabilities = chancesFor(choice), injection = { type: "noul", noul: 0.04 } as unknown } = {},
): Response {
    return Response.json({
        model,
        answers: { label: { type: "choice", choice, confidence: 0.82, probabilities }, injection },
        usage: { input_tokens: 412, output_tokens: 12 },
    });
}

const status = (code: number, headers: Record<string, string> = {}) => new Response("no", { status: code, headers });
const jev = () => jevDetector({ apiKey: "ts-test-key" });

describe("jevDetector", () => {
    it("asks Jev to pick one of the labels and reads its answer", async () => {
        const fetch = answers(jevReply("phishing"));

        const answer = await jev().label("Your mailbox is full. Log in here to keep your messages.");

        expect(answer).toEqual({ label: "phishing", probabilities: chancesFor("phishing"), injection: 0.04 });
        const [url, init] = fetch.mock.calls[0]!;
        expect(url).toBe("https://api.typesafe.ai/v1/systemone");
        expect(init.method).toBe("POST");
        expect(init.headers).toEqual({ authorization: "Bearer ts-test-key", "content-type": "application/json" });
        const body = JSON.parse(String(init.body));
        expect(body).toMatchObject({
            model: "jev-1.13.0",
            state: "Your mailbox is full. Log in here to keep your messages.",
            questions: { label: { type: "choice" }, injection: { type: "noul" } },
        });
        expect(body.questions.injection.instructions).toContain("instruct an AI agent that is reading it");
        expect(Object.keys(body.questions.label.criteria)).toEqual(LABEL_NAMES);
        expect(body.questions.label.criteria.none).toBe("None of the other labels fits this text.");
    });

    it("names itself after the pinned model, so decisions record the version", () => {
        expect(jev().name).toBe("jev-1.13.0");
    });

    it("needs an API key", () => {
        expect(() => jevDetector({ apiKey: "" })).toThrow("jevDetector() needs an apiKey");
    });

    it.each([
        ["a busy reply that asks for no wait", status(429, { "retry-after": "0" })],
        ["a busy reply with a past date", status(429, { "retry-after": new Date(0).toUTCString() })],
        ["a busy reply with a wait it can't read", status(503, { "retry-after": "soon" })],
        ["a failed network", new TypeError("fetch failed")],
        ["a try that took too long", new DOMException("slow", "TimeoutError")],
    ])("tries once more after %s", async (_what, first) => {
        const fetch = answers(first, jevReply("article"));

        expect((await jev().label("text")).label).toBe("article");
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it("tries at most twice, and says why it failed", async () => {
        const fetch = answers(status(529));

        await expect(jev().label("text")).rejects.toMatchObject({ name: "DetectorError", reason: "http_529" });
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it.each([
        ["seconds", "30"],
        ["a date", new Date(Date.now() + 60_000).toUTCString()],
    ])("does not wait when the server asks for a long wait in %s", async (_what, wait) => {
        const fetch = answers(status(429, { "retry-after": wait }));

        await expect(jev().label("text")).rejects.toMatchObject({ reason: "http_429" });
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("does not retry a refused key, and logs it once", async () => {
        const fetch = answers(status(401));
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        const detector = jev();

        await expect(detector.label("a")).rejects.toMatchObject({ reason: "http_401" });
        await expect(detector.label("b")).rejects.toMatchObject({ reason: "http_401" });

        expect(fetch).toHaveBeenCalledTimes(2);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining("refused the API key"));
    });

    it("refuses another model version, and logs it once", async () => {
        answers(jevReply("article", { model: "jev-1.14.0" }));
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        const detector = jev();

        await expect(detector.label("a")).rejects.toMatchObject({ reason: "model:jev-1.14.0" });
        await expect(detector.label("b")).rejects.toMatchObject({ reason: "model:jev-1.14.0" });

        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining("jev-1.14.0 answered instead of jev-1.13.0"));
    });

    it.each([
        ["a label Quard did not offer", jevReply("spam", { probabilities: chancesFor("article") })],
        ["a label without its chance", jevReply("article", { probabilities: { article: 1 } })],
        [
            "chances that don't add up to 1",
            jevReply("article", { probabilities: { ...chancesFor("article"), none: 0.5 } }),
        ],
        ["text that is not JSON", new Response("not json")],
        ["no yes or no answer", jevReply("article", { injection: null })],
        ["a yes or no answer above 1", jevReply("article", { injection: { type: "noul", noul: 1.2 } })],
    ])("refuses %s without a retry", async (_what, reply) => {
        const fetch = answers(reply);

        await expect(jev().label("text")).rejects.toMatchObject({ reason: "bad_reply" });
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("stops when Quard stops waiting, without a retry", async () => {
        const fetch = answers(
            (init) =>
                new Promise((_, reject) => {
                    init.signal?.addEventListener("abort", () => reject(new DOMException("stopped", "AbortError")));
                }),
        );
        const stop = new AbortController();

        const pending = jev().label("text", { signal: stop.signal });
        stop.abort();

        await expect(pending).rejects.toMatchObject({ reason: "timeout" });
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("stops waiting to retry when Quard stops waiting", async () => {
        const fetch = answers(status(503), jevReply("article"));
        const stop = new AbortController();

        const pending = jev().label("text", { signal: stop.signal });
        await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
        await new Promise((resolve) => setTimeout(resolve, 50));
        stop.abort();

        await expect(pending).rejects.toMatchObject({ reason: "timeout" });
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("does not retry when Quard stopped waiting during the first try", async () => {
        const stop = new AbortController();
        const fetch = answers(async () => {
            stop.abort();
            return status(503);
        }, jevReply("article"));

        await expect(jev().label("text", { signal: stop.signal })).rejects.toMatchObject({ reason: "timeout" });
        expect(fetch).toHaveBeenCalledTimes(1);
    });
});
