import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubBrowser } from "../../../../../test/auth-app/browser";
import { detail } from "../../../../../test/agents-lib-detail/fixtures";
import { NOW } from "../../../../../test/time";
import type { AgentDetail } from "@/lib/data/agents";
import AgentPage, { generateMetadata } from "./page";

const query = vi.hoisted(() => ({
    getAgent: vi.fn<(name: string) => Promise<AgentDetail | null>>(),
    requestTime: vi.fn(async () => 0),
}));
vi.mock("@/lib/data/agents", () => ({ getAgent: query.getAgent }));
vi.mock("@/lib/data/scope", () => ({ requestTime: query.requestTime }));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: () => undefined }),
    notFound: () => {
        throw new Error("not found");
    },
}));

// Percent-encodes the first letter, as a browser may, so the page has to decode it
const encoded = (name: string) => `%${name.charCodeAt(0).toString(16)}${name.slice(1)}`;

const props = (name: string) => ({ params: Promise.resolve({ name }), searchParams: Promise.resolve({}) });

describe("AgentPage", () => {
    beforeEach(() => {
        stubBrowser();
        query.getAgent.mockReset().mockImplementation(async (name) => (name === "researcher" ? detail() : null));
        query.requestTime.mockResolvedValue(NOW);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("shows the agent named in the address, after decoding it", async () => {
        render(await AgentPage(props(encoded("researcher"))));
        expect(query.getAgent).toHaveBeenCalledWith("researcher");
        expect(screen.getByRole("heading", { level: 1, name: "researcher" })).toBeTruthy();
    });

    it("tells the agent's age from the request time", async () => {
        render(await AgentPage(props("researcher")));
        expect(screen.getByText("claude-sonnet").parentElement?.textContent).toBe("claude-sonnet·seen 3 h ago");
    });

    it("keeps every pane for a quiet agent, with empty charts and table headers", async () => {
        render(await AgentPage(props("researcher")));
        expect(screen.getByText("researcher has made no calls yet")).toBeTruthy();
        expect(screen.getByRole("img", { name: "No model calls in the last 24 hours" })).toBeTruthy();
        expect(screen.getAllByRole("button", { name: "Table" })).toHaveLength(2);
        for (const name of ["Versions", "Incidents"]) {
            expect(within(screen.getByRole("region", { name })).getAllByRole("columnheader")).toHaveLength(4);
        }
        expect(screen.getByText("None · starts its own runs")).toBeTruthy();
    });

    it("shows the not-found page for an unknown agent", async () => {
        await expect(AgentPage(props("nobody"))).rejects.toThrow("not found");
    });

    it("titles the tab with the agent name, or says it is missing", async () => {
        expect(await generateMetadata(props(encoded("researcher")))).toEqual({ title: "researcher" });
        expect(await generateMetadata(props("nobody"))).toEqual({ title: "Agent not found" });
    });
});
