import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FallbackValue, LabelName } from "./label-name";

describe("LabelName", () => {
    it("marks risky labels with the warning square", () => {
        const risky = render(<LabelName label="phishing" />).container;
        expect(risky.textContent).toBe("phishing");
        expect(risky.querySelector(".bg-warning")).not.toBeNull();
        expect(render(<LabelName label="tax_notice" />).container.querySelector(".bg-warning")).toBeNull();
    });
});

describe("FallbackValue", () => {
    it.each([
        [null, "—"],
        [{ state: "pending" as const, label: null }, "Waiting"],
        [{ state: "skipped" as const, label: null }, "Skipped"],
        [{ state: "failed" as const, label: null }, "Failed"],
        [{ state: "done" as const, label: null }, "—"],
        [{ state: "done" as const, label: "tax_notice" }, "tax_notice"],
    ])("shows %j as %s", (fallback, text) => {
        expect(render(<FallbackValue fallback={fallback} />).container.textContent).toBe(text);
    });
});
