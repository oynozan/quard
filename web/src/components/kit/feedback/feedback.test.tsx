import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { stubClipboard, unstubClipboard } from "../../../../test/ui-kit-metal/clipboard";
import { CautionBox, ErrorBox, Notice, WarningRule } from "./feedback";

afterEach(unstubClipboard);

describe("ErrorBox", () => {
    it("alerts with what happened, what to do and an action", () => {
        render(
            <ErrorBox help="Try again in a minute." action={<button type="button">Retry</button>}>
                Could not load runs.
            </ErrorBox>,
        );
        const alert = screen.getByRole("alert");
        expect(alert.textContent).toBe("Could not load runs.Try again in a minute.Retry");
        expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    });

    it("shows only the message without help or an action", () => {
        render(<ErrorBox>Could not load runs.</ErrorBox>);
        expect(screen.getByRole("alert").children).toHaveLength(1);
    });
});

describe("WarningRule", () => {
    it("shows the title, the note and a copyable identifier", async () => {
        const writeText = stubClipboard();
        render(<WarningRule title="Key expires soon" note="Rotate it this week." identifier="key_123" />);
        expect(screen.getByText("Key expires soon")).toBeTruthy();
        expect(screen.getByText("Rotate it this week.")).toBeTruthy();
        expect(screen.getByText("key_123")).toBeTruthy();
        await act(async () => {
            fireEvent.click(screen.getByRole("button"));
        });
        expect(writeText).toHaveBeenCalledWith("key_123");
    });

    it("shows only the title without a note or identifier", () => {
        const { container } = render(<WarningRule title="Key expires soon" />);
        expect(container.querySelectorAll("p")).toHaveLength(1);
        expect(screen.queryByRole("button")).toBeNull();
    });
});

describe("CautionBox", () => {
    it("shows its text", () => {
        render(<CautionBox>This cannot be undone.</CautionBox>);
        expect(screen.getByText("This cannot be undone.")).toBeTruthy();
    });
});

describe("Notice", () => {
    it("shows a hidden icon before its text", () => {
        render(<Notice icon={<svg data-testid="icon" />}>Data is kept 30 days.</Notice>);
        const aside = screen.getByRole("complementary");
        expect(aside.textContent).toBe("Data is kept 30 days.");
        expect(screen.getByTestId("icon").parentElement?.getAttribute("aria-hidden")).toBe("true");
    });

    it("shows only the text without an icon", () => {
        render(<Notice>Data is kept 30 days.</Notice>);
        expect(screen.getByRole("complementary").children).toHaveLength(1);
    });
});
