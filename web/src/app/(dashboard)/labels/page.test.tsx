import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { labelsData } from "../../../../test/labels/chunks";
import LabelsPage, { metadata } from "./page";

const data = vi.hoisted(() => ({ getContentLabels: vi.fn() }));
vi.mock("@/lib/data/content-labels/query", () => data);
vi.mock("@/lib/data/content-labels/actions", () => ({ reviewLabel: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("LabelsPage", () => {
    it("titles the tab", () => {
        expect(metadata.title).toBe("Labels");
    });

    it("shows the queue, the counts per label and the latest reviews", async () => {
        data.getContentLabels.mockResolvedValueOnce(labelsData());
        render(await LabelsPage());
        expect(screen.getByRole("heading", { level: 1, name: "Labels" })).toBeTruthy();
        const sections = screen.getAllByRole("heading", { level: 2 }).map((node) => node.textContent);
        expect(sections).toEqual(["To review2", "Per label", "Reviewed"]);
        expect(screen.getAllByRole("table")).toHaveLength(3);
    });
});
