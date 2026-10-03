import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { RunStatus } from "@/lib/data/types";
import { Badge, LabelChip, RunStatusLabel, StatusSquare } from "./labels";

describe("StatusSquare", () => {
    it("is hidden from screen readers and draws an outline when off", () => {
        const { container } = render(<StatusSquare tone="off" />);
        const square = container.firstElementChild;
        expect(square?.getAttribute("aria-hidden")).toBe("true");
        expect(square?.className).toContain("border-line-strong");
    });
});

describe("RunStatusLabel", () => {
    const cases: [RunStatus, string, string][] = [
        ["running", "Running", "bg-signal"],
        ["waiting", "Waiting", "bg-warning"],
        ["completed", "Completed", "bg-chart-context"],
        ["failed", "Failed", "bg-danger"],
        ["blocked", "Blocked", "bg-danger"],
    ];

    it.each(cases)("writes %s as %s with its square", (status, word, fill) => {
        const { container } = render(<RunStatusLabel status={status} />);
        expect(container.textContent).toBe(word);
        expect(container.querySelector("[aria-hidden]")?.className).toContain(fill);
    });
});

describe("LabelChip", () => {
    it("marks an untrusted origin with the warm fill", () => {
        const { container } = render(
            <LabelChip label={{ origin: "web.fetch", trust: "untrusted", sensitivity: "public" }} />,
        );
        const chip = container.firstElementChild;
        expect(chip?.textContent).toBe("web.fetchuntrusted");
        expect(chip?.getAttribute("title")).toBe("web.fetch · untrusted · public");
        expect(chip?.className).toContain("bg-caution-surface");
    });

    it("keeps a trusted origin neutral", () => {
        const { container } = render(
            <LabelChip label={{ origin: "user", trust: "trusted", sensitivity: "internal" }} />,
        );
        const chip = container.firstElementChild;
        expect(chip?.textContent).toBe("usertrusted");
        expect(chip?.className).toContain("bg-tile");
    });
});

describe("Badge", () => {
    it("shows its text", () => {
        render(<Badge>gpt-5</Badge>);
        expect(screen.getByText("gpt-5")).toBeTruthy();
    });
});
