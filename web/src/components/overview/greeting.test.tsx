import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Greeting } from "./greeting";

describe("Greeting", () => {
    it("is the page title, with room below it when asked", () => {
        render(<Greeting text="Good evening. One agent is running." className="mb-[18px]" />);
        const title = screen.getByRole("heading", { level: 1 });

        expect(title.textContent).toBe("Good evening. One agent is running.");
        expect(title.className).toContain("font-extralight");
        expect(title.className).toContain("mb-[18px]");
    });
});
