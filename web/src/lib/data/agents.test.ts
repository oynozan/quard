// @vitest-environment node
import { describe, expect, it } from "vitest";
import * as agents from "./agents";
import { getAgent } from "./agents/detail";
import { getAgentGraph } from "./agents/graph";
import { costOf } from "./agents/prices";
import { agentNames } from "./agents/roster";
import { versionAt } from "./agents/versions";

describe("agents data", () => {
    it("exposes the roster, graph, detail, versions and prices from one place", () => {
        expect(agents.agentNames).toBe(agentNames);
        expect(agents.getAgentGraph).toBe(getAgentGraph);
        expect(agents.getAgent).toBe(getAgent);
        expect(agents.versionAt).toBe(versionAt);
        expect(agents.costOf).toBe(costOf);
        expect(agents.REVIEWER_MODEL).toBe("gpt-6.1-sol");
        expect(Object.keys(agents.AGENT_VERSIONS)).toEqual(agents.AGENTS.map((agent) => agent.name));
        expect(Object.keys(agents.MODEL_PRICES)).toContain(agents.REVIEWER_MODEL);
        expect(agents.AGENT_STATES.billing).toBe("running");
    });
});
