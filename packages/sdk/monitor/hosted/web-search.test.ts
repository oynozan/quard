import type { RunEvent } from "@quard/shared";
import { afterEach, describe, expect, it } from "vitest";
import { configure } from "../../core/config.ts";
import { takeEvents } from "../../core/recorder.ts";
import { currentScope, runScope } from "../../context/scope.ts";
import { guard } from "../../pipeline/guard.ts";
import { fakeResponses } from "../../test/fake-responses.ts";
import { resetAll } from "../../test/reset.ts";
import { createMonitorFetch } from "../fetch.ts";

afterEach(() => {
    resetAll();
});

const URL_RESPONSES = "https://api.openai.com/v1/responses";
const post = (body: object): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

const search = {
    type: "web_search_call",
    id: "ws_1",
    status: "completed",
    action: {
        type: "search",
        query: "acme pricing",
        sources: [
            { type: "url", url: "https://docs.acme.com/a" },
            { type: "url", url: "https://evil.com/pay" },
            { type: "url", url: "not a url" },
            { type: "url", url: "file:///etc/hosts" },
            { type: "url" },
        ],
    },
};
const opened = { type: "web_search_call", id: "ws_2", status: "completed", action: { type: "open_page" } };
const cited = {
    type: "message",
    id: "msg_1",
    role: "assistant",
    content: [
        { type: "output_text", text: "See", annotations: [{ type: "url_citation", url: "https://news.org/x" }, {}] },
        { type: "refusal" },
    ],
};
const plain = { type: "message", id: "msg_2", role: "assistant" };

function contents(events: RunEvent[]) {
    return events.flatMap((event) =>
        event.type === "content" ? [[event.origin, event.trust, event.sensitivity, event.flags]] : [],
    );
}

function decisions(events: RunEvent[]) {
    return events.flatMap((event) =>
        event.type === "decision" ? [[event.tool, event.guard, event.rule, event.decision, event.mode]] : [],
    );
}

async function searchOnce(stream: boolean, items: object[] = [search, opened, cited, plain]) {
    const fake = fakeResponses(() => ({ items }));
    const monitored = createMonitorFetch(fake.fetch);
    const response = await monitored(
        URL_RESPONSES,
        post({ model: "gpt", input: "find", stream, tools: [{ type: "web_search" }] }),
    );
    await response.text();
    return fake.bodies;
}

describe("hosted web search", () => {
    it("labels each consulted site as untrusted web content, flagged unscanned", async () => {
        const bodies = await searchOnce(false);

        expect(bodies[0]?.include).toEqual(["web_search_call.action.sources"]);
        expect(contents(takeEvents())).toEqual([
            ["user", "trusted", "internal", []],
            ["web:docs.acme.com", "untrusted", "public", ["unscanned"]],
            ["web:evil.com", "untrusted", "public", ["unscanned"]],
            ["web:news.org", "untrusted", "public", ["unscanned"]],
        ]);
    });

    it("limits the search to allowed domains and flags blocked sites it still saw", async () => {
        configure({
            hostedTools: {
                web_search: [
                    { type: "source", origin: "web", allowDomains: ["*.acme.com", "news.org"] },
                    { type: "source", origin: "web", blockDomains: ["news.org"], mode: "observe" },
                ],
            },
        });

        const bodies = await searchOnce(true);
        const events = takeEvents();

        expect(bodies[0]?.tools).toEqual([
            { type: "web_search", filters: { allowed_domains: ["acme.com", "news.org"] } },
        ]);
        expect(decisions(events)).toEqual([
            ["web_search", "source", "domain", "pass", "block"],
            ["web_search", "source", "domain", "pass", "observe"],
            ["web_search", "source", "domain", "flag", "block"],
            ["web_search", "source", "domain", "pass", "observe"],
            ["web_search", "source", "domain", "pass", "block"],
            ["web_search", "source", "domain", "flag", "observe"],
        ]);
        expect(contents(events).map(([origin, , , flags]) => [origin, flags])).toEqual([
            ["user", []],
            ["web:docs.acme.com", ["unscanned"]],
            ["web:evil.com", ["unscanned", "blocked_domain"]],
            ["web:news.org", ["unscanned"]],
        ]);
    });

    it("takes the policy file's rules over the code's", async () => {
        const { tempDir, writeJson } = await import("../../test/files.ts");
        const path = writeJson(`${tempDir()}/policy.json`, {
            version: 1,
            guards: { web_search: [{ type: "source", origin: "web", blockDomains: ["acme.com", "docs.acme.com"] }] },
        });
        configure({ policyFile: path, hostedTools: { web_search: [] } });

        await searchOnce(false, [search]);

        expect(decisions(takeEvents()).map((row) => row[3])).toEqual(["flag", "pass"]);
    });

    it("makes the run web-influenced, so value tracing finds the sites", async () => {
        const sent: string[] = [];
        const post = guard(async (input: { url: string }) => sent.push(input.url), {
            type: "egress",
            name: "postData",
            allow: ["evil.com"],
        });

        const result = await runScope({ agent: "a" }, async () => {
            await searchOnce(false, [search]);
            expect(currentScope()?.run.index.context().trust).toBe("untrusted");
            return post({ url: "https://evil.com/pay" });
        });

        expect(sent).toEqual([]);
        expect(String(result)).toContain("egress guard");
    });
});
