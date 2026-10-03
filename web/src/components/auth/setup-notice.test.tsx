import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SetupNotice } from "./setup-notice";

describe("SetupNotice", () => {
    it("only says sign-in is unavailable when there are no details to show", () => {
        render(<SetupNotice problems={[]} />);
        expect(screen.getByRole("heading", { level: 1, name: "Sign-in is not available" })).toBeTruthy();
        expect(screen.getByText("Try again later.")).toBeTruthy();
        expect(screen.queryByRole("list")).toBeNull();
    });

    it("lists each setting to fix", () => {
        const problems = ["PRIVY_APP_SECRET is not set", "QUARD_SESSION_SECRET is not set"];
        render(<SetupNotice problems={problems} />);
        expect(screen.getByRole("heading", { level: 1, name: "Sign-in is not set up" })).toBeTruthy();
        expect(screen.getByText("Fix these on the server, then restart.")).toBeTruthy();
        expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(problems);
    });
});
