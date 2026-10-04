import { describe, expect, it } from "vitest";
import { DETECTOR_LABELS, isRiskyLabel, LABEL_NAME, LABEL_NAMES } from "./detector.ts";

describe("the detector's labels", () => {
    it("list risky labels first and none last", () => {
        expect(LABEL_NAMES.slice(0, 4)).toEqual(["prompt_injection", "payment_fraud", "phishing", "malicious_code"]);
        expect(LABEL_NAMES.at(-1)).toBe("none");
        expect(LABEL_NAMES.every((name) => LABEL_NAME.test(name))).toBe(true);
    });

    it("say which labels are risky, and new labels never are", () => {
        expect(isRiskyLabel("payment_fraud")).toBe(true);
        expect(isRiskyLabel("invoice")).toBe(false);
        expect(isRiskyLabel("tax_notice")).toBe(false);
        expect(isRiskyLabel("toString")).toBe(false);
        expect(DETECTOR_LABELS.none.risky).toBe(false);
    });

    it("accept short lowercase names only", () => {
        expect(LABEL_NAME.test("tax_notice")).toBe(true);
        expect(LABEL_NAME.test("Tax")).toBe(false);
        expect(LABEL_NAME.test("a".repeat(41))).toBe(false);
    });
});
