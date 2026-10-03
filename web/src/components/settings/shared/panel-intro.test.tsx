import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LiveNote, PanelIntro } from "./panel-intro";

describe("PanelIntro", () => {
    it("shows the intro line and the panel action", () => {
        render(
            <PanelIntro action={<button type="button">Invite</button>}>Keys the SDK uses to send events.</PanelIntro>,
        );
        expect(screen.getByText("Keys the SDK uses to send events.")).toBeTruthy();
        expect(screen.getByRole("button", { name: "Invite" })).toBeTruthy();
    });

    it("leaves out the action slot when there is no action", () => {
        const { container } = render(<PanelIntro>Read-only.</PanelIntro>);
        expect(container.firstElementChild?.children).toHaveLength(1);
    });
});

describe("LiveNote", () => {
    it("reads the message out politely", () => {
        render(<LiveNote message="Key staging created." />);
        const note = screen.getByRole("status");
        expect(note.textContent).toBe("Key staging created.");
        expect(note.getAttribute("aria-live")).toBe("polite");
    });
});
