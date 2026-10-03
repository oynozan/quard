import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AuthCard } from "./auth-card";

describe("AuthCard", () => {
    it("shows the brand, the classifier, the meta and the body", () => {
        render(
            <AuthCard classifier="Sign in" meta="v0.1">
                <p>Body</p>
            </AuthCard>,
        );
        const header = screen.getByRole("banner");
        expect(header.textContent).toBe("quardSign inv0.1");
        expect(screen.getByText("Body")).toBeTruthy();
    });

    it("leaves out the meta when there is none", () => {
        render(<AuthCard classifier="Sign in">Body</AuthCard>);
        expect(screen.getByRole("banner").textContent).toBe("quardSign in");
    });
});
