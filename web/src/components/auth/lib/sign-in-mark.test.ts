import { describe, expect, it } from "vitest";
import { clearSignInNote, cookieWasDropped, noteSignIn } from "./sign-in-mark";

function memory() {
    const items = new Map<string, string>();
    return {
        getItem: (key: string) => items.get(key) ?? null,
        setItem: (key: string, value: string) => void items.set(key, value),
        removeItem: (key: string) => void items.delete(key),
    };
}

const broken = {
    getItem: () => {
        throw new Error("blocked");
    },
    setItem: () => {
        throw new Error("blocked");
    },
    removeItem: () => {
        throw new Error("blocked");
    },
};

describe("sign-in note", () => {
    it("flags a return to sign-in right after a sign-in", () => {
        const storage = memory();
        noteSignIn(storage, 1_000);
        expect(cookieWasDropped(storage, 5_000)).toBe(true);
        expect(cookieWasDropped(storage, 20_000)).toBe(false);
        clearSignInNote(storage);
        expect(cookieWasDropped(storage, 5_000)).toBe(false);
    });

    it("stays quiet when storage is blocked or missing", () => {
        expect(() => noteSignIn(broken)).not.toThrow();
        expect(() => clearSignInNote(broken)).not.toThrow();
        expect(cookieWasDropped(broken)).toBe(false);
        expect(cookieWasDropped(undefined)).toBe(false);
    });

    it("uses the session storage of the page by default", () => {
        noteSignIn();
        expect(cookieWasDropped()).toBe(true);
        clearSignInNote();
        expect(cookieWasDropped()).toBe(false);
    });
});
