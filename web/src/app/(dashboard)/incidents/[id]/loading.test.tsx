import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import IncidentLoading from "./loading";

describe("IncidentLoading", () => {
    it("tells screen readers the incident is loading", () => {
        const { container } = render(<IncidentLoading />);
        expect(screen.getByRole("status").textContent).toBe("Loading the incident…");
        expect(container.firstElementChild!.getAttribute("aria-busy")).toBe("true");
    });

    it("keeps bars for the title, the five path steps, the replay pane and the verdict rows", () => {
        const { container } = render(<IncidentLoading />);
        const page = container.firstElementChild as HTMLElement;
        const [back, title, path, columns] = [...page.children].slice(1) as HTMLElement[];
        expect(back.style.width).toBe("80px");
        expect(title.style.width).toBe("420px");
        expect(path.children).toHaveLength(5);
        for (const step of path.children) expect(step.querySelectorAll(".skel")).toHaveLength(3);
        const [replay, verdict] = [...columns.children] as HTMLElement[];
        expect(replay.className).toContain("h-[320px]");
        expect(verdict.children).toHaveLength(5);
        for (const row of verdict.children) expect(row.querySelectorAll(".skel")).toHaveLength(2);
    });
});
