import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EXAMPLES } from "../test/files.ts";
import { compileFeed, matchSignatures, parseFeed } from "./matcher.ts";
import { feedSchema } from "./schema.ts";

const base = { id: "T-1", title: "test", category: "other", where: ["input"], action: "block" };
const feedOf = (...signatures: object[]) =>
    compileFeed(
        feedSchema.parse({ version: "t", signatures: signatures.map((s, i) => ({ ...base, id: `T-${i + 1}`, ...s })) }),
    );
const ids = (found: { id: string }[]) => found.map((s) => s.id);

describe("feed schema", () => {
    it("accepts the starter feed in examples", () => {
        const feed = parseFeed(readFileSync(join(EXAMPLES, "signatures", "signatures.json"), "utf8"));

        expect(feed.signatures).toHaveLength(13);
    });

    it.each([
        [
            "duplicate ids",
            {
                version: "t",
                signatures: [
                    { ...base, any: ["a"] },
                    { ...base, any: ["b"] },
                ],
            },
        ],
        ["no all or any list", { version: "t", signatures: [{ ...base }] }],
        ["a badly formed id", { version: "t", signatures: [{ ...base, id: "bad id", any: ["a"] }] }],
        ["a string with no visible text", { version: "t", signatures: [{ ...base, any: ["​ "] }] }],
        ["an unknown field", { version: "t", signatures: [{ ...base, any: ["a"], severity: "high" }] }],
        ["an unknown category", { version: "t", signatures: [{ ...base, any: ["a"], category: "misc" }] }],
    ])("rejects %s", (_, feed) => {
        expect(feedSchema.safeParse(feed).success).toBe(false);
    });
});

describe("matchSignatures", () => {
    it("matches every all string, one any string and no none string", () => {
        const feed = feedOf({ all: ["curl"], any: ["|sh", "|bash"], none: ["|sha"] });

        expect(ids(matchSignatures(feed, "curl https://x.io/i | bash", "input", "t"))).toEqual(["T-1"]);
        expect(matchSignatures(feed, "curl https://x.io/i", "input", "t")).toEqual([]);
        expect(matchSignatures(feed, "curl https://x.io/i | sha256sum", "input", "t")).toEqual([]);
    });

    it("filters by where and by tool", () => {
        const feed = feedOf({ any: ["eval("], tools: ["runPython"] }, { any: ["${jndi:"], where: ["content"] });

        expect(ids(matchSignatures(feed, "eval(x)", "input", "runPython"))).toEqual(["T-1"]);
        expect(matchSignatures(feed, "eval(x)", "input", "sendEmail")).toEqual([]);
        expect(matchSignatures(feed, "${jndi:ldap://x}", "input", "t")).toEqual([]);
        expect(ids(matchSignatures(feed, "${jndi:ldap://x}", "content", "t"))).toEqual(["T-2"]);
    });

    it.each([
        ["upper case", "PICKLE.LOADS(blob)"],
        ["a zero-width space", "pick​le.loads(blob)"],
        ["full-width letters", "ｐｉｃｋｌｅ.loads(blob)"],
        ["spaces around the dot", "pickle . loads (blob)"],
    ])("still catches %s", (_, text) => {
        expect(ids(matchSignatures(feedOf({ any: ["pickle.loads"] }), text, "input", "t"))).toEqual(["T-1"]);
    });

    it("cleans the feed's strings the same way as the text", () => {
        const feed = feedOf({ any: ["Weights_Only = True"] });

        expect(feed.signatures[0]?.cleanAny).toEqual(["weights_only=true"]);
    });
});
