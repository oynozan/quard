import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { expectNoChartsOrTables } from "../../../test/empty";
import { EmptyLine } from "./empty";
import { PageHeading, SectionHeading } from "./headings";
import { Pane } from "./pane";

describe("EmptyLine", () => {
    it("shows one short Muted line with no frame around it", () => {
        render(<EmptyLine>No runs yet</EmptyLine>);
        const line = screen.getByRole("status");

        expect(line.textContent).toBe("No runs yet");
        expect(line.className).toContain("text-ink-muted");
        expect(line.className).toContain("text-[13px]");
        expect(line.className).toContain("font-light");
        expect(line.className).not.toMatch(/border|center|min-h|h-\[|px-/);
    });

    it("sits under a page or section heading with nothing else drawn", () => {
        const { container } = render(
            <>
                <PageHeading title="Runs" />
                <EmptyLine>No runs yet</EmptyLine>
                <SectionHeading title="Recent calls" />
                <EmptyLine>No calls in the last 24 hours</EmptyLine>
            </>,
        );

        expect(screen.getAllByRole("heading").map((heading) => heading.textContent)).toEqual(["Runs", "Recent calls"]);
        expect(screen.getAllByRole("status").map((line) => line.textContent)).toEqual([
            "No runs yet",
            "No calls in the last 24 hours",
        ]);
        expectNoChartsOrTables(container);
    });

    it("pads itself to the pane gutter inside a pane body, and takes extra classes", () => {
        render(
            <Pane title="Model calls per hour">
                <EmptyLine inset className="extra">
                    No model calls in the last 24 hours
                </EmptyLine>
            </Pane>,
        );
        const line = screen.getByRole("status");

        expect(line.className).toContain("px-3");
        expect(line.className).toContain("py-[14px]");
        expect(line.className).toContain("extra");
        expectNoChartsOrTables();
    });
});

describe("expectNoChartsOrTables", () => {
    const fails = (node: ReactNode) => {
        const { container, unmount } = render(<section>{node}</section>);
        expect(() => expectNoChartsOrTables(container)).toThrow();
        unmount();
    };

    it("fails on a table, a header cell, a chart, a meter or a loading state", () => {
        fails(
            <table>
                <tbody>
                    <tr>
                        <td>1</td>
                    </tr>
                </tbody>
            </table>,
        );
        fails(<div role="columnheader">Agent</div>);
        fails(<div role="img" aria-label="Runs per hour" aria-hidden />);
        fails(<div role="progressbar" aria-valuenow={3} />);
        fails(<meter value={0.5} />);
        fails(<div aria-busy="true" />);
    });

    it("checks the root itself, and the whole page by default", () => {
        const { container } = render(
            <div aria-busy="true">
                <EmptyLine>No runs yet</EmptyLine>
            </div>,
        );

        expect(() => expectNoChartsOrTables(container.firstElementChild as HTMLElement)).toThrow();
        expect(() => expectNoChartsOrTables()).toThrow();
    });

    it("passes a section that is not busy any more", () => {
        const { container } = render(
            <section aria-busy="false">
                <EmptyLine>No runs yet</EmptyLine>
            </section>,
        );

        expectNoChartsOrTables(container.firstElementChild as HTMLElement);
    });
});
