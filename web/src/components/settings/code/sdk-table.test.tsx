import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { getSettings } from "@/lib/data/settings";
import { NOW } from "@/lib/data/rng";
import { SdkTable } from "./sdk-table";

const { sdks } = await getSettings();

function rowOf(name: string): HTMLElement {
    return screen.getByText(name).closest("tr") as HTMLElement;
}

describe("SdkTable", () => {
    it("says so when no SDK has connected", () => {
        render(<SdkTable sdks={[]} now={NOW} />);
        expect(screen.getByRole("status").textContent).toBe("No SDK connected yet");
        expect(screen.queryByRole("table")).toBeNull();
    });

    it("lists offline apps before connected ones", () => {
        render(<SdkTable sdks={sdks} now={NOW} />);
        const names = screen
            .getAllByRole("row")
            .slice(1)
            .map((row) => row.querySelector("strong")?.textContent);
        expect(names).toEqual(["deploy-runner", "orchestrator-app", "billing-service", "support-app"]);
        const headers = screen.getAllByRole("columnheader").map((cell) => cell.textContent);
        expect(headers).toEqual(["App", "Agents", "SDK", "Agent key", "Rules hash", "Last seen", "State"]);
    });

    it("shows a connected app with its agents, version, key and a recent hash change", () => {
        render(<SdkTable sdks={sdks} now={NOW} />);
        const cells = within(rowOf("orchestrator-app"))
            .getAllByRole("cell")
            .map((cell) => cell.textContent);
        expect(cells).toEqual([
            "orchestrator-appNode 24.9.0",
            "orchestrator, researcher",
            "0.4.2",
            "qk_live_2c8e…",
            "e9d17c2a5b08Changed 6 d ago",
            "1 min ago",
            "Connected",
        ]);
        expect(screen.getByText("orchestrator, researcher").getAttribute("title")).toBe("orchestrator, researcher");
        expect(within(rowOf("orchestrator-app")).getByTitle("Was a3f60b9d2e14")).toBeTruthy();
    });

    it("shows an offline app with no hash change line when the hash never changed", () => {
        render(<SdkTable sdks={sdks} now={NOW} />);
        const row = rowOf("deploy-runner");
        const cells = within(row)
            .getAllByRole("cell")
            .map((cell) => cell.textContent);
        expect(cells[4]).toBe("0c6f3b9e2a71");
        expect(cells[6]).toBe("Offline");
        expect(within(row).queryByText(/Changed/)).toBeNull();
    });
});
