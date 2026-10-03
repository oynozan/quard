import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SdkConnection } from "@/lib/data/settings";
import { SDKS } from "../../../../test/settings/sdks";
import { NOW } from "../../../../test/time";
import { SdkTable } from "./sdk-table";

const [CONNECTED, OFFLINE] = SDKS as [SdkConnection, SdkConnection];

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
        expect(headers).toEqual(["App", "SDK", "Agent key", "Rules hash", "Last seen", "State"]);
    });

    it("shows a connected app with its host, SDK version, key prefix and rules hash", () => {
        render(<SdkTable sdks={SDKS} now={NOW} />);
        expect(cells("orchestrator-app")).toEqual([
            "orchestrator-appweb-1",
            "0.4.2",
            "qk_live_2c8e…",
            "e9d17c2a5b08f1d3",
            "1 min ago",
            "Connected",
        ]);
    });

    it("shows an offline app with when it was last seen", () => {
        render(<SdkTable sdks={SDKS} now={NOW} />);
        expect(cells("deploy-runner")).toEqual([
            "deploy-runnerci-runner-3",
            "0.4.1",
            "qk_live_91be…",
            "0c6f3b9e2a71c4d5",
            "2 h ago",
            "Offline",
        ]);
    });

    it("lists two apps whose agent keys share a name", () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        // A revoked key's name can be used again
        const twin = { ...OFFLINE, id: "key-old", name: CONNECTED.name };
        render(<SdkTable sdks={[CONNECTED, twin]} now={NOW} />);
        expect(screen.getAllByText("orchestrator-app")).toHaveLength(2);
        expect(error).not.toHaveBeenCalled();
        error.mockRestore();
    });

    it("keeps its header with a quiet line under it when no app is connected", () => {
        render(<SdkTable sdks={[]} now={NOW} />);
        const table = screen.getByRole("table", { name: "Connected apps and the rules hash each one reported" });
        expect(within(table).getAllByRole("columnheader")).toHaveLength(6);
        expect(within(table).getAllByRole("row")).toHaveLength(1);
        expect(screen.getByRole("status").textContent).toBe("No SDK connected yet");
    });

    it("has no quiet line while apps are listed", () => {
        render(<SdkTable sdks={SDKS} now={NOW} />);
        expect(screen.queryByRole("status")).toBeNull();
    });
});
