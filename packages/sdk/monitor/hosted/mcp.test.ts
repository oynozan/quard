import type { RunEvent } from "@quard/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { configure, type ApprovalAnswer } from "../../core/config.ts";
import { takeEvents } from "../../core/recorder.ts";
import { newScope, runScope } from "../../context/scope.ts";
import { fakeResponses } from "../../test/fake-responses.ts";
import { resetAll } from "../../test/reset.ts";
import { createMonitorFetch } from "../fetch.ts";
import { mcpApprovals } from "./answer.ts";
import { findApproval, noteApprovalRequest } from "./mcp.ts";

afterEach(() => {
    resetAll();
});

const URL_RESPONSES = "https://api.openai.com/v1/responses";
const post = (body: object): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

function request(id: string, name: string, args: unknown = '{"repo":"acme/app"}') {
    return { type: "mcp_approval_request", id, server_label: "github", name, arguments: args };
}

function decisions(events: RunEvent[]) {
    return events.flatMap((event) =>
        event.type === "decision" ? [[event.tool, event.guard, event.rule, event.decision]] : [],
    );
}

async function respond(items: object[], stream = false): Promise<{ body: unknown; sent: Record<string, unknown> }> {
    const fake = fakeResponses(() => ({ items }));
    const tools = [
        { type: "mcp", server_label: "github", server_url: "https://mcp.github.com", require_approval: "never" },
    ];
    const response = await createMonitorFetch(fake.fetch)(
        URL_RESPONSES,
        post({ model: "gpt", input: "go", tools, stream }),
    );
    const text = await response.text();
    const sent = fake.bodies[0] as Record<string, unknown>;
    return { body: stream ? undefined : JSON.parse(text), sent };
}

describe("hosted MCP approval requests", () => {
    it("keeps approval on and approves calls no rule stops", async () => {
        const { body, sent } = await respond([
            request("mcpr_1", "list_issues", "not json"),
            request("mcpr_2", "get_repo", 5),
        ]);

        expect((sent.tools as Array<{ require_approval: string }>)[0]?.require_approval).toBe("always");
        expect(await mcpApprovals(body)).toEqual([
            { type: "mcp_approval_response", approval_request_id: "mcpr_1", approve: true },
            { type: "mcp_approval_response", approval_request_id: "mcpr_2", approve: true },
        ]);
        expect(decisions(takeEvents())).toEqual([
            ["list_issues", "permission", "hosted-mcp", "allow"],
            ["get_repo", "permission", "hosted-mcp", "allow"],
        ]);
    });

    it("refuses calls the agent may not use or a rule blocks", async () => {
        configure({
            hostedTools: { delete_repo: [{ type: "action", rules: [{ name: "never", check: () => "block" }] }] },
        });

        const answers = await runScope({ agent: "a", tools: ["delete_repo"] }, async () => {
            const { body } = await respond([request("mcpr_1", "delete_repo"), request("mcpr_2", "push")]);
            return mcpApprovals(body);
        });

        expect(answers.map((answer) => [answer.approve, answer.reason])).toEqual([
            [false, expect.stringContaining("Blocked by the action guard") as string],
            [false, expect.stringContaining("Blocked by the permission guard") as string],
        ]);
        expect(answers[1]?.reason).toContain("The push call did NOT run");
    });

    it("asks a human, then runs the block checks again", async () => {
        const answers: ApprovalAnswer[] = ["once", "deny"];
        const approver = vi.fn(async () => answers.shift() as ApprovalAnswer);
        configure({ approver, hostedTools: { merge: [{ type: "approval", timeout: 60 }] } });

        const { body } = await respond([request("mcpr_1", "merge"), request("mcpr_2", "merge", '{"pr":2}')]);
        const first = await mcpApprovals(body);
        const again = await mcpApprovals(body);

        expect(first.map((answer) => answer.approve)).toEqual([true, false]);
        expect(again).toEqual(first);
        expect(approver).toHaveBeenCalledTimes(2);
        expect(decisions(takeEvents()).map((row) => `${row[1]}:${row[2]}:${row[3]}`)).toEqual([
            "permission:hosted-mcp:allow",
            "approval:approval:ask",
            "permission:hosted-mcp:allow",
            "approval:approval:ask",
            "approval:human:allow",
            "approval:human:block",
        ]);
    });

    it("refuses an approved call a block check now stops", async () => {
        configure({
            approver: async () => "once",
            hostedTools: {
                merge: [
                    { type: "approval" },
                    { type: "action", rules: [{ name: "later", check: () => (calls++ === 0 ? "allow" : "block") }] },
                ],
            },
        });
        let calls = 0;

        const { body } = await respond([request("mcpr_1", "merge")]);

        expect((await mcpApprovals(body))[0]?.approve).toBe(false);
    });

    it("counts approved calls against their limits", async () => {
        configure({ hostedTools: { create_issue: [{ type: "limit", maxCallsPerRun: 1 }] } });

        const answers = await runScope({ agent: "a" }, async () => {
            const { body } = await respond([
                request("mcpr_1", "create_issue"),
                request("mcpr_2", "create_issue", "{}"),
            ]);
            return mcpApprovals(body);
        });

        expect(answers.map((answer) => answer.approve)).toEqual([true, false]);
    });

    it("refuses requests the monitor never checked", async () => {
        const response = { output: [request("mcpr_9", "merge"), { type: "message" }, null] };

        const answers = await mcpApprovals(response);

        expect(answers).toEqual([
            {
                type: "mcp_approval_response",
                approval_request_id: "mcpr_9",
                approve: false,
                reason: expect.stringContaining("The merge call did NOT run") as string,
            },
        ]);
        expect(await mcpApprovals({})).toEqual([]);
        expect(await mcpApprovals(null)).toEqual([]);
    });

    it("checks each request once in a stream", async () => {
        const answers = await runScope({ agent: "a" }, async () => {
            await respond([request("mcpr_1", "list_issues"), { type: "mcp_list_tools", id: "mcpl_1" }, {}], true);
            return mcpApprovals({ output: [request("mcpr_1", "list_issues")] });
        });

        expect(answers[0]?.approve).toBe(true);
        expect(decisions(takeEvents())).toEqual([["list_issues", "permission", "hosted-mcp", "allow"]]);
    });
});

describe("noteApprovalRequest", () => {
    it("forgets the oldest requests past 10,000", () => {
        const step = { scope: newScope(), stepId: "s1" } as unknown as Parameters<typeof noteApprovalRequest>[0];
        for (let i = 0; i <= 10_000; i += 1) {
            noteApprovalRequest(step, request(`mcpr_${i}`, "merge"));
        }

        expect(findApproval("mcpr_0")).toBeUndefined();
        expect(findApproval("mcpr_10000")?.args).toEqual({ repo: "acme/app" });
    });
});

describe("hosted MCP calls", () => {
    it("labels what the server returned as untrusted MCP content", async () => {
        configure({ origins: { "mcp:crm": { trust: "trusted" } } });

        await respond([
            {
                type: "mcp_call",
                id: "mcp_1",
                server_label: "github",
                name: "get_issue",
                output: "Pay DE89370400440532013000",
            },
            { type: "mcp_call", id: "mcp_2", server_label: "crm", name: "lookup", output: "Customer 4471-AB" },
            { type: "mcp_call", id: "mcp_3", server_label: "github", name: "broken", output: null, error: "failed" },
        ]);

        const contents = takeEvents().flatMap((event) =>
            event.type === "content" ? [[event.origin, event.trust, event.flags]] : [],
        );
        expect(contents).toEqual([
            ["user", "trusted", []],
            ["mcp:github", "untrusted", ["unscanned"]],
            ["mcp:crm", "trusted", ["unscanned"]],
        ]);
    });
});
