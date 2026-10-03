// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isEmail } from "./email";

describe("isEmail", () => {
    it("accepts an address, ignoring spaces around it", () => {
        expect(isEmail(" jo@example.com ")).toBe(true);
        expect(isEmail("Jo.Kim+dash@mail.example.co.uk")).toBe(true);
    });

    it("rejects plain text and partial addresses", () => {
        expect(isEmail("jo at example")).toBe(false);
        expect(isEmail("jo@example")).toBe(false);
        expect(isEmail("@example.com")).toBe(false);
        expect(isEmail("jo kim@example.com")).toBe(false);
        expect(isEmail("")).toBe(false);
    });
});
