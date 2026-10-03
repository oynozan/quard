import { describe, expect, it } from "vitest";
import { askMessage, countMessage } from "../test/messages.ts";
import { parseMessage, replyId } from "./parse.ts";

describe("parseMessage", () => {
    it("reads a valid message", () => {
        const ask = askMessage();

        expect(parseMessage(JSON.stringify(ask))).toEqual({ ok: true, message: ask });
    });

    it("says when a message is not JSON", () => {
        expect(parseMessage("{nope")).toEqual({ ok: false, error: "The message is not valid JSON", id: undefined });
    });

    it("says what is wrong, with the request it is about", () => {
        const parsed = parseMessage(JSON.stringify({ ...countMessage({ id: "abc" }), add: -1 }));

        expect(parsed).toEqual({ ok: false, error: expect.stringContaining("add: "), id: "abc" });
    });

    it("keeps the list of problems short", () => {
        const parsed = parseMessage(JSON.stringify({ type: "count" }));

        expect(parsed.ok ? "" : parsed.error.split("; ")).toHaveLength(3);
    });

    it("explains a message that is not an object", () => {
        const parsed = parseMessage("5");

        expect(parsed).toEqual({ ok: false, error: expect.stringMatching(/^Invalid input/), id: undefined });
    });
});

describe("replyId", () => {
    it.each([
        ["a request id", { id: "r1", askId: "a1" }, "r1"],
        ["an ask id", { askId: "a1" }, "a1"],
        ["an id that is not text", { id: 5 }, undefined],
        ["no id", { type: "beat" }, undefined],
        ["null", null, undefined],
        ["a number", 5, undefined],
    ])("finds %s", (_, value, id) => {
        expect(replyId(value)).toBe(id);
    });
});
