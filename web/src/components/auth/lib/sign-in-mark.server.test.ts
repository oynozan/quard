// @vitest-environment node
import { describe, expect, it } from "vitest";
import { clearSignInNote, cookieWasDropped, noteSignIn } from "./sign-in-mark";

describe("sign-in note on the server", () => {
    it("does nothing where there is no window", () => {
        expect(() => noteSignIn()).not.toThrow();
        expect(() => clearSignInNote()).not.toThrow();
        expect(cookieWasDropped()).toBe(false);
    });
});
