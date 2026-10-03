import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Field, FieldHint, HelpText } from "./field";

describe("Field", () => {
    it("labels its control and shows the preview, hint and help", () => {
        const { container } = render(
            <Field
                label="Name"
                htmlFor="name"
                hint="Lowercase only"
                preview="agent/billing"
                help="You can rename it later"
            >
                <input id="name" />
            </Field>,
        );
        expect(screen.getByLabelText("Name").id).toBe("name");
        expect(screen.getByText("agent/billing")).toBeTruthy();
        expect(screen.getByText("Lowercase only").className).toContain("text-ink-muted");
        expect(screen.getByText("You can rename it later")).toBeTruthy();
        expect(screen.queryByRole("status")).toBeNull();
        // Help text adds room before the next field
        expect(container.firstElementChild?.className).toContain("mb-5");
    });

    it("replaces the hint with the problem and announces it", () => {
        render(
            <Field label="Name" hint="Lowercase only" problem="Name is taken">
                <input />
            </Field>,
        );
        const problem = screen.getByRole("status");
        expect(problem.textContent).toBe("Name is taken");
        expect(problem.className).toContain("text-problem");
        expect(screen.queryByText("Lowercase only")).toBeNull();
    });

    it("shows only the label and control when nothing else is given", () => {
        const { container } = render(
            <Field label="Name" hintTone="positive">
                <input />
            </Field>,
        );
        expect(container.querySelectorAll("p")).toHaveLength(0);
        expect(container.firstElementChild?.className).toContain("mb-[18px]");
    });

    it("uses the hint tone it is given", () => {
        render(
            <Field label="Name" hint="Looks good" hintTone="positive">
                <input />
            </Field>,
        );
        expect(screen.getByText("Looks good").className).toContain("text-ink-link");
    });
});

describe("FieldHint", () => {
    it("is muted by default", () => {
        render(<FieldHint>Optional</FieldHint>);
        expect(screen.getByText("Optional").className).toContain("text-ink-muted");
    });
});

describe("HelpText", () => {
    it("keeps extra classes", () => {
        render(<HelpText className="extra">Read more</HelpText>);
        expect(screen.getByText("Read more").className).toContain("extra");
    });
});
