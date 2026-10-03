import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SDKS } from "../../../../test/settings/sdks";
import { NOW } from "../../../../test/time";
import { SdkTable } from "./sdk-table";

function rowOf(name: string): HTMLElement {
    return screen.getByText(name).closest("tr") as HTMLElement;
}

function cells(name: string): (string | null)[] {
    return within(rowOf(name))
        .getAllByRole("cell")
        .map((cell) => cell.textContent);
}

describe("SdkTable", () => {
    it("lists offline apps before connected ones", () => {
        render(<SdkTable sdks={SDKS} now={NOW} />);
        const names = screen
            .getAllByRole("row")
            .slice(1)
            .map((row) => row.querySelector("strong")?.textContent);
        expect(names).toEqual(["deploy-runner", "orchestrator-app"]);
        const headers = screen.getAllByRole("columnheader").map((cell) => cell.textContent);
        expect(headers).toEqual(["App", "Agents", "SDK", "Agent key", "Rules hash", "Last seen", "State"]);
    });

    it("shows a connected app with its agents, version, key and a recent hash change", () => {
        render(<SdkTable sdks={SDKS} now={NOW} />);
        expect(cells("orchestrator-app")).toEqual([
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
        render(<SdkTable sdks={SDKS} now={NOW} />);
        const row = cells("deploy-runner");
        expect(row[4]).toBe("0c6f3b9e2a71");
        expect(row[6]).toBe("Offline");
        expect(within(rowOf("deploy-runner")).queryByText(/Changed/)).toBeNull();
    });
});
