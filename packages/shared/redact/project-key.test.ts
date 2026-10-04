import { describe, expect, it } from "vitest";
import { HASH_KEY_PATH, hashKeyReply } from "./project-key.ts";

describe("hashKeyReply", () => {
    it("takes 64 lowercase hex characters", () => {
        expect(HASH_KEY_PATH).toBe("/v1/hash-key");
        expect(hashKeyReply.safeParse({ hashKey: "ab".repeat(32) }).success).toBe(true);
    });

    it.each(["AB".repeat(32), "ab".repeat(31), "zz".repeat(32)])("rejects %j", (hashKey) => {
        expect(hashKeyReply.safeParse({ hashKey }).success).toBe(false);
    });
});
