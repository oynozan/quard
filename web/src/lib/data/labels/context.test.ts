// @vitest-environment node
import { describe, expect, it } from "vitest";
import { contextOf, EMPTY_CONTEXT, isInfluenced } from "./context";
import type { Label } from "../types";

const user: Label = { origin: "user", trust: "trusted", sensitivity: "internal" };
const docs: Label = { origin: "mcp:docs.internal", trust: "trusted", sensitivity: "public" };
const web: Label = { origin: "web:supplier-portal.example", trust: "untrusted", sensitivity: "public" };
const mail: Label = { origin: "email:gmail.com", trust: "untrusted", sensitivity: "public" };

describe("contextOf", () => {
    it("starts as trusted public instructions before anything is read", () => {
        expect(contextOf([])).toBe(EMPTY_CONTEXT);
        expect(EMPTY_CONTEXT).toEqual({ origin: "instructions", trust: "trusted", sensitivity: "public" });
    });

    it("names the first untrusted content as the origin", () => {
        expect(contextOf([user, web, mail])).toEqual({
            origin: "web:supplier-portal.example",
            trust: "untrusted",
            sensitivity: "internal",
        });
    });

    it("names the first internal content when everything is trusted", () => {
        expect(contextOf([docs, user])).toEqual({ origin: "user", trust: "trusted", sensitivity: "internal" });
    });

    it("falls back to the first label when everything is trusted and public", () => {
        const notes = { ...docs, origin: "mcp:notes.internal" };
        expect(contextOf([docs, notes])).toEqual(docs);
    });

    it("stays public when only public content was read", () => {
        expect(contextOf([web, mail])).toEqual({ ...web, sensitivity: "public" });
    });
});

describe("isInfluenced", () => {
    it("is true only for untrusted context", () => {
        expect(isInfluenced(web)).toBe(true);
        expect(isInfluenced(user)).toBe(false);
    });
});
