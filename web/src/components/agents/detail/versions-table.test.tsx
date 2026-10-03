import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { version } from "../../../../test/agents-lib-detail/fixtures";
import { VersionsTable } from "./versions-table";

// Newest first, as the agent page passes them
const versions = [
    version("v4", {
        tools: ["search", "delegate"],
        toolsBefore: ["search", "fetch"],
        current: true,
        note: "Can delegate",
        since: Date.UTC(2026, 7, 20),
    }),
    version("v3", {
        tools: ["search", "fetch"],
        toolsBefore: ["search", "fetch"],
        since: Date.UTC(2026, 6, 1),
        until: Date.UTC(2026, 7, 20),
    }),
    version("v2", {
        tools: ["search", "fetch"],
        toolsBefore: ["search"],
        since: Date.UTC(2026, 5, 12),
        until: Date.UTC(2026, 6, 1),
    }),
    version("v1", { tools: ["search"], since: Date.UTC(2026, 5, 2), until: Date.UTC(2026, 5, 12) }),
];

function rows() {
    return screen.getAllByRole("row").slice(1);
}

describe("VersionsTable", () => {
    it("counts the versions in the heading", () => {
        render(<VersionsTable versions={versions} />);
        expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Versions4");
    });

    it("explains each version's tool change on hover over the version cell", () => {
        render(<VersionsTable versions={versions} />);
        const titles = rows().map((row) => row.children[0].getAttribute("title"));
        expect(titles.slice(0, 3)).toEqual([
            "2 tools: search, delegate (Added delegate · Removed fetch)",
            "2 tools: search, fetch (Same tools)",
            "2 tools: search, fetch (Added fetch)",
        ]);
        expect(titles[3]).toBe("1 tool: search (First version)");
    });

    it("names a version that only dropped tools", () => {
        render(<VersionsTable versions={[version("v2", { tools: [], toolsBefore: ["search"] }), version("v1")]} />);
        const title = rows()[0].children[0].getAttribute("title");
        expect(title).toBe("No tools (Removed search)");
    });

    it("compares the oldest version listed with the one before it, even when that one is not listed", () => {
        render(<VersionsTable versions={[version("v101", { tools: ["search"], toolsBefore: ["search", "fetch"] })]} />);
        const title = rows()[0].children[0].getAttribute("title");
        expect(title).toBe("1 tool: search (Removed fetch)");
    });

    it("marks the current version and shows its note", () => {
        render(<VersionsTable versions={versions} />);
        expect(rows()[0].children[0].textContent).toBe("v4CurrentCan delegate");
        expect(rows()[1].children[0].textContent).toBe("v3");
    });

    it("shows the model and a short instructions hash with the full hash on hover", () => {
        render(<VersionsTable versions={versions.slice(0, 1)} />);
        const [, model, hash] = rows()[0].children;
        expect(model.textContent).toBe("claude-sonnet");
        expect(hash.textContent).toBe("abcdef012345");
        expect(hash.getAttribute("title")).toBe("abcdef0123456789abcdef");
    });

    it("says None for a version that ran without instructions", () => {
        render(<VersionsTable versions={[version("v1", { instructionsHash: null })]} />);
        const hash = rows()[0].children[2];
        expect(hash.textContent).toBe("None");
        expect(hash.hasAttribute("title")).toBe(false);
    });

    it("shows how long each version was live, up to now for the current one", () => {
        render(<VersionsTable versions={versions} />);
        expect(rows().map((row) => row.children[3].textContent)).toEqual([
            "20 Aug to now",
            "1 Jul to 20 Aug",
            "12 Jun to 1 Jul",
            "2 Jun to 12 Jun",
        ]);
    });

    it("keeps the count and the table header over a line saying there are no versions yet", () => {
        render(<VersionsTable versions={[]} />);
        expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Versions0");
        const headers = screen.getAllByRole("columnheader").map((cell) => cell.textContent);
        expect(headers).toEqual(["Version", "Model", "Instructions", "Live"]);
        expect(rows()).toHaveLength(0);
        expect(screen.getByRole("status").textContent).toBe("No versions yet");
    });

    it("leaves the empty line out once there is a version", () => {
        render(<VersionsTable versions={versions.slice(0, 1)} />);
        expect(screen.queryByRole("status")).toBeNull();
    });
});
