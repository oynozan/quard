import { describe, expect, it } from "vitest";
import { costText } from "./cost";

const format = (value: number) => `$${value.toFixed(4)}`;

describe("costText", () => {
    it("shows the cost when every price is known, or when nothing says otherwise", () => {
        expect(costText(0.0031, true, format)).toBe("$0.0031");
        expect(costText(0.5, undefined, format)).toBe("$0.5000");
    });

    it("shows a dash when a price is unknown", () => {
        expect(costText(0, false, format)).toBe("—");
    });
});
