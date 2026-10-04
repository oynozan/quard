import { describe, expect, it } from "vitest";
import { DetectorError } from "./detector.ts";
import { checkAnswer, LABEL_NAMES, riskOf, topRisk, type DetectorAnswer } from "./labels.ts";

const answer = (probabilities: DetectorAnswer["probabilities"]): DetectorAnswer => ({
    label: "article",
    probabilities,
});

describe("detector labels", () => {
    it("list risky labels first and none last", () => {
        expect(LABEL_NAMES.slice(0, 4)).toEqual(["prompt_injection", "payment_fraud", "phishing", "malicious_code"]);
        expect(LABEL_NAMES.at(-1)).toBe("none");
    });
});

describe("riskOf", () => {
    it("adds up the chances of the risky labels only", () => {
        expect(riskOf(answer({ phishing: 0.6, payment_fraud: 0.3, article: 0.1 }))).toBe(0.9);
        expect(riskOf(answer({ article: 1 }))).toBe(0);
    });

    it("never goes above 1", () => {
        expect(riskOf(answer({ phishing: 0.8, prompt_injection: 0.8 }))).toBe(1);
    });
});

describe("topRisk", () => {
    it("picks the most likely risky label, even when a safe one is likelier", () => {
        expect(topRisk(answer({ invoice: 0.5, phishing: 0.2, payment_fraud: 0.3 }))).toBe("payment_fraud");
    });

    it("breaks a tie toward the label listed first", () => {
        expect(topRisk(answer({ phishing: 0.4, payment_fraud: 0.4 }))).toBe("payment_fraud");
        expect(topRisk(answer({ article: 1 }))).toBe("prompt_injection");
    });
});

describe("checkAnswer", () => {
    it("returns a valid answer as it is", () => {
        const valid = answer({ article: 0.9, none: 0.1 });
        const withInjection = { ...valid, injection: 0.2 };

        expect(checkAnswer(valid)).toBe(valid);
        expect(checkAnswer(withInjection)).toBe(withInjection);
    });

    it.each([
        ["an unknown label", { label: "spam", probabilities: { article: 1 } }],
        ["a chance for an unknown label", { label: "article", probabilities: { article: 0.9, spam: 0.1 } }],
        [
            "a chance for a label name events can't hold",
            { label: "article", probabilities: { article: 0.9, "Prompt-Injection": 0.1 } },
        ],
        ["a chance above 1", { label: "article", probabilities: { article: 1.5 } }],
        ["a negative chance", { label: "article", probabilities: { article: -0.1 } }],
        ["a chance that is not a number", { label: "article", probabilities: { article: Number.NaN } }],
        ["a missing chance", { label: "article", probabilities: { article: undefined } }],
        ["no chance for its own label", { label: "article", probabilities: { invoice: 1 } }],
        ["no chances at all", { label: "article", probabilities: {} }],
        ["an injection chance above 1", { label: "article", probabilities: { article: 1 }, injection: 2 }],
        [
            "an injection chance that is missing",
            { label: "article", probabilities: { article: 1 }, injection: undefined },
        ],
    ])("refuses %s", (_what, bad) => {
        expect(() => checkAnswer(bad as DetectorAnswer)).toThrow(new DetectorError("bad_reply"));
    });
});
