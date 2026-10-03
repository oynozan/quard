import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SettingsLoading from "./loading";

describe("SettingsLoading", () => {
    it("keeps the heading while settings load", () => {
        render(<SettingsLoading />);
        expect(screen.getByRole("heading", { level: 1, name: "Settings" })).toBeTruthy();
        expect(screen.getByRole("status").textContent).toBe("Loading settings…");
    });
});
