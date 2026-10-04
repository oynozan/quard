import { describe, expect, it } from "vitest";
import { unvouchedKeys } from "./unvouched.ts";

describe("unvouchedKeys", () => {
    it("lists the keys of values no record vouched for, but not a host a vouched value shares", () => {
        const text = "Log in at https://pay.acme.com/login, then https://pay.acme.com/other and https://evil.io/x";

        const keys = unvouchedKeys(text, (value) => value.value === "https://pay.acme.com/login");

        expect(keys).toEqual([
            "url:https://pay.acme.com/other",
            "url:https://evil.io/x",
            "host:evil.io",
            "domain:evil.io",
        ]);
    });

    it("lists nothing when every value is vouched for", () => {
        expect(unvouchedKeys("Pay DE89370400440532013000", () => true)).toEqual([]);
    });
});
