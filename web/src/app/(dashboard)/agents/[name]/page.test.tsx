import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubBrowser } from "../../../../../test/auth-app/browser";
import { agentNames } from "@/lib/data/agents";
import AgentPage, { generateMetadata } from "./page";

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
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("shows the agent named in the address, after decoding it", async () => {
        const name = agentNames()[0]!;
        render(await AgentPage(props(encoded(name))));
        expect(screen.getByRole("heading", { level: 1, name })).toBeTruthy();
        expect(screen.getByText("Model calls per hour")).toBeTruthy();
    });

    it("shows the not-found page for an unknown agent", async () => {
        await expect(AgentPage(props("nobody"))).rejects.toThrow("not found");
    });

    it("titles the tab with the agent name, or says it is missing", async () => {
        const name = agentNames()[0]!;
        expect(await generateMetadata(props(encoded(name)))).toEqual({ title: name });
        expect(await generateMetadata(props("nobody"))).toEqual({ title: "Agent not found" });
    });
});
