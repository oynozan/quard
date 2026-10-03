import { afterEach, describe, expect, it, vi } from "vitest";
import { LABEL_NAMES } from "../labels.ts";
import { JEV_MODEL, jevDetector } from "./jev.ts";

afterEach(() => {
    vi.unstubAllGlobals();
});

// Stubs fetch with one reply
function answers(reply: Response) {
    const fetch = vi.fn(async (_url: string, _init: RequestInit) => reply);
    vi.stubGlobal("fetch", fetch);
    return fetch;
}

// A reply as Jev's API sends it
function jevReply(choice: string, model = JEV_MODEL): Response {
    return Response.json({
        model,
        answers: {
            label: {
                type: "choice",
                choice,
                confidence: 0.82,
                probabilities: { [choice]: 0.9, business_message: 0.1 },
            },
        },
        usage: { input_tokens: 412, output_tokens: 12 },
    });
}

const jev = () => jevDetector({ apiKey: "ts-test-key" });

describe("jevDetector", () => {
    it("asks Jev to pick one of the labels and reads its answer", async () => {
        const fetch = answers(jevReply("phishing"));

        const answer = await jev().label("Your mailbox is full. Log in here to keep your messages.");

        expect(answer).toEqual({ label: "phishing", probabilities: { phishing: 0.9, business_message: 0.1 } });
        const [url, init] = fetch.mock.calls[0]!;
        expect(url).toBe("https://api.typesafe.ai/v1/systemone");
        expect(init.method).toBe("POST");
        expect(init.headers).toEqual({ authorization: "Bearer ts-test-key", "content-type": "application/json" });
        const body = JSON.parse(String(init.body));
        expect(body).toMatchObject({
            model: "jev-1.13.0",
            state: "Your mailbox is full. Log in here to keep your messages.",
            questions: { label: { type: "choice" } },
        });
        expect(Object.keys(body.questions.label.criteria)).toEqual(LABEL_NAMES);
        expect(body.questions.label.criteria.none).toBe("None of the other labels fits this text.");
    });

    it("names itself after the pinned model, so decisions record the version", () => {
        expect(jev().name).toBe("jev-1.13.0");
    });

    it("needs an API key", () => {
        expect(() => jevDetector({ apiKey: "" })).toThrow("jevDetector() needs an apiKey");
    });

    it("throws when Jev refuses the request", async () => {
        answers(new Response("overloaded", { status: 529 }));

        await expect(jev().label("text")).rejects.toThrow("Jev answered HTTP 529");
    });

    it("throws when another model version answers", async () => {
        answers(jevReply("article", "jev-1.14.0"));

        await expect(jev().label("text")).rejects.toThrow();
    });

    it("throws on a label Quard did not offer", async () => {
        answers(jevReply("spam"));

        await expect(jev().label("text")).rejects.toThrow();
    });
});
