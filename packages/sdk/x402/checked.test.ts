import { afterEach, describe, expect, it } from "vitest";
import { checkedHost, clearChecked, isChecked, markChecked } from "./checked.ts";

describe("checked payments", () => {
    afterEach(clearChecked);

    it("knows a payment by its content, whatever the key order", () => {
        markChecked({ x402Version: 2, payload: { signature: "0xabc", to: "0x1" } }, "api.paid.dev");
        expect(isChecked({ payload: { to: "0x1", signature: "0xabc" }, x402Version: 2 })).toBe(true);
        expect(isChecked({ x402Version: 2, payload: { signature: "0xdef" } })).toBe(false);
    });

    it("keeps the host the guard checked each payment for", () => {
        markChecked({ i: 1 }, "api.paid.dev");
        markChecked({ i: 2 }, "");
        expect(checkedHost({ i: 1 })).toBe("api.paid.dev");
        expect(checkedHost({ i: 2 })).toBe("");
        expect(checkedHost({ i: 3 })).toBeUndefined();
    });

    it("keeps the newest 10,000", () => {
        for (let i = 0; i <= 10_000; i++) {
            markChecked({ i }, "h");
        }
        markChecked({ i: 1 }, "h");
        expect(isChecked({ i: 0 })).toBe(false);
        expect(isChecked({ i: 1 })).toBe(true);
        expect(isChecked({ i: 10_000 })).toBe(true);
    });
});
