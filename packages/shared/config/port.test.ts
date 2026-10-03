import { describe, expect, it } from "vitest";
import { readPort } from "./port.ts";

describe("readPort", () => {
    it("uses the fallback when the value is missing", () => {
        expect(readPort(undefined, 4100)).toBe(4100);
    });

    it("uses the fallback when the value is empty", () => {
        expect(readPort("", 4100)).toBe(4100);
    });

    it("parses a valid port", () => {
        expect(readPort("8080", 4100)).toBe(8080);
    });

    it.each(["abc", "0", "65536", "80.5", "-1"])("rejects %s", (value) => {
        expect(() => readPort(value, 4100)).toThrow(`Invalid port: ${value}`);
    });
});
