import { uploadBatch } from "@quard/shared";
import { describe, expect, it } from "vitest";
import { issuesOf, readJson } from "./request.ts";

describe("readJson", () => {
    it("reads a JSON body, and gives undefined for anything else", async () => {
        const body = (text: string) => new Request("http://webhook/", { method: "POST", body: text });

        expect(await readJson(body('{"events":[]}'))).toEqual({ events: [] });
        expect(await readJson(body("not json"))).toBeUndefined();
    });
});

describe("issuesOf", () => {
    it("lists the first five problems with their paths", () => {
        const events = Array.from({ length: 8 }, () => ({ id: "nope", event: {} }));
        const parsed = uploadBatch.safeParse({ events });

        if (parsed.success) {
            throw new Error("the batch should not pass");
        }
        const issues = issuesOf(parsed.error);
        expect(issues).toHaveLength(5);
        expect(issues[0]).toMatch(/^events\.0\.id: /);
    });
});
