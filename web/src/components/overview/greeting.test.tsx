import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Greeting } from "./greeting";

describe("Greeting", () => {
    it("is the page title in the thin display face", () => {
        render(<Greeting text="Good evening. One agent is running." />);
        const title = screen.getByRole("heading", { level: 1 });

        expect(title.textContent).toBe("Good evening. One agent is running.");
        expect(title.className).toContain("font-extralight");
    });
});
