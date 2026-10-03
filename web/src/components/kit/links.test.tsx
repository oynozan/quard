import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ArrowLink, RowChevron, RowLink, TextLink } from "./links";

describe("TextLink", () => {
    it("links to its target and switches to mono when asked", () => {
        render(
            <>
                <TextLink href="/runs/1" mono>
                    run_1
                </TextLink>
                <TextLink href="/docs">Read the docs</TextLink>
            </>,
        );
        const mono = screen.getByRole("link", { name: "run_1" });
        expect(mono.getAttribute("href")).toBe("/runs/1");
        expect(mono.className.split(" ")).toContain("mono");
        expect(screen.getByRole("link", { name: "Read the docs" }).className.split(" ")).not.toContain("mono");
    });
});

describe("ArrowLink", () => {
    it("shows the words with a hidden chevron", () => {
        render(<ArrowLink href="/agents">View all</ArrowLink>);
        const link = screen.getByRole("link", { name: "View all" });
        expect(link.getAttribute("href")).toBe("/agents");
        expect(link.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    });
});

describe("RowLink", () => {
    it("is the main link of a row", () => {
        render(
            <RowLink href="/agents/billing" className="extra">
                billing-bot
            </RowLink>,
        );
        const link = screen.getByRole("link", { name: "billing-bot" });
        expect(link.getAttribute("href")).toBe("/agents/billing");
        expect(link.className).toContain("extra");
    });
});

describe("RowChevron", () => {
    it("draws a chevron that screen readers skip", () => {
        const { container } = render(<RowChevron className="extra" />);
        const svg = container.querySelector("svg");
        expect(svg?.getAttribute("aria-hidden")).toBe("true");
        expect(svg?.getAttribute("class")).toContain("extra");
    });
});
