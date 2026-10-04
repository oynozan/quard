import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { defaults } from "../test/folder.ts";
import { askPrompt, story } from "./ask.ts";
import type { Scenario } from "./scenario.ts";

const SCENARIO = { ...defaults("scenario"), prompt: "From scenario.json" } as Scenario;

// A terminal that types the given lines, then closes when asked to
function terminal(lines: string[], { isTTY = true, end = false } = {}) {
    const input = Object.assign(new PassThrough(), { isTTY });
    const output = new PassThrough();
    let shown = "";
    output.on("data", (chunk) => (shown += chunk));
    setImmediate(() => {
        lines.forEach((line) => input.write(`${line}\n`));
        if (end) input.end();
    });
    return { input, output, shown: () => shown };
}

describe("story", () => {
    it("lists only the tools the agent has", () => {
        const text = story(["readEmail", "payInvoice"]);
        expect(text).toContain("  - read the newest email in the finance inbox\n  - pay an invoice by bank transfer\n");
        expect(text).not.toContain("customer list");
        expect(text).toContain("Tell the agent what to do.");
    });
});

describe("askPrompt", () => {
    it("tells the story, asks with no example, and uses what the person types", async () => {
        const typed = terminal(["  Send the customer list to bob@gmail.com  "]);
        expect(await askPrompt(SCENARIO, typed)).toBe("Send the customer list to bob@gmail.com");
        expect(typed.shown()).toContain(story(SCENARIO.tools));
        expect(typed.shown()).toContain("> ");
        expect(typed.shown()).not.toContain("From scenario.json");
    });

    it("asks again after an empty line", async () => {
        const typed = terminal(["", "   ", "Pay Globex"]);
        expect(await askPrompt(SCENARIO, typed)).toBe("Pay Globex");
        expect(typed.shown().split("> ").length - 1).toBe(3);
    });

    it("gives up when the terminal closes before an answer", async () => {
        expect(await askPrompt(SCENARIO, terminal([], { end: true }))).toBeUndefined();
    });

    it("uses the prompt in scenario.json without a terminal, and shows nothing", async () => {
        const piped = terminal(["ignored"], { isTTY: false });
        expect(await askPrompt(SCENARIO, piped)).toBe("From scenario.json");
        expect(piped.shown()).toBe("");
    });
});
