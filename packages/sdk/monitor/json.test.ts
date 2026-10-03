import { describe, expect, it } from "vitest";
import { asRecord, parseJson } from "./json.ts";

describe("json helpers", () => {
    it("accepts only plain objects as records", () => {
        expect(asRecord({ a: 1 })).toEqual({ a: 1 });
        expect(asRecord([1])).toBeUndefined();
        expect(asRecord(null)).toBeUndefined();
        expect(asRecord("x")).toBeUndefined();
    });

    it("parses JSON or returns undefined", () => {
        expect(parseJson('{"a":1}')).toEqual({ a: 1 });
        expect(parseJson("not json")).toBeUndefined();
    });
});
