// @vitest-environment node
import { describe, expect, it } from "vitest";
import { AGENT_STATES, AGENTS, agentNames } from "./roster";

describe("AGENTS", () => {
    it("takes each agent's version, model and tools from its current version", () => {
        expect(AGENTS.find((agent) => agent.name === "researcher")).toEqual({
            name: "researcher",
            version: "v9",
            model: "gpt-6.1-mini",
            tools: ["fetch_page", "web_search", "delegate"],
            state: "running",
        });
    });

    it("keeps the state each agent has right now", () => {
        expect(AGENTS.map((agent) => agent.state)).toEqual(Object.values(AGENT_STATES));
        expect(AGENT_STATES["deploy-bot"]).toBe("offline");
    });
});

describe("agentNames", () => {
    it("names every agent in roster order", () => {
        expect(agentNames()).toEqual([
            "orchestrator",
            "researcher",
            "billing",
            "support",
            "inbox-triage",
            "deploy-bot",
        ]);
    });
});
