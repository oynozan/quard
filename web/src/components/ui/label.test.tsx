import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Label } from "./label";

describe("Label", () => {
    it("names the field it points at", () => {
        render(
            <>
                <Label htmlFor="agent" className="extra">
                    Agent name
                </Label>
                <input id="agent" />
            </>,
        );
        expect(screen.getByLabelText("Agent name").id).toBe("agent");
        expect(screen.getByText("Agent name").className).toContain("extra");
    });
});
