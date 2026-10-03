import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AgentNotFound from "./not-found";

describe("AgentNotFound", () => {
    it("says the agent is missing, that names are case sensitive, and links back", () => {
        render(<AgentNotFound />);
        expect(screen.getByRole("heading", { level: 1, name: "Agent not found" })).toBeTruthy();
        expect(screen.getByText("Names are case sensitive.")).toBeTruthy();
        expect(screen.getByRole("link", { name: "Back to agents" }).getAttribute("href")).toBe("/agents");
    });
});
