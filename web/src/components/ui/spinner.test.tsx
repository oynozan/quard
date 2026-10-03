import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FadeDots, Spinner } from "./spinner";

describe("Spinner", () => {
    it("is a hidden 13px ring unless sized", () => {
        const { container, rerender } = render(<Spinner />);
        const ring = container.firstElementChild as HTMLElement;
        expect(ring.getAttribute("aria-hidden")).toBe("true");
        expect(ring.style.width).toBe("13px");
        rerender(<Spinner size={20} className="extra" />);
        expect(ring.style.height).toBe("20px");
        expect(ring.className).toBe("spinner extra");
    });
});

describe("FadeDots", () => {
    it("announces loading with four dots pulsing in turn", () => {
        render(<FadeDots />);
        const status = screen.getByRole("status", { name: "Loading…" });
        const delays = [...status.querySelectorAll<HTMLElement>(".fade-dot")].map((dot) => dot.style.animationDelay);
        expect(delays).toEqual(["0ms", "200ms", "400ms", "600ms"]);
    });

    it("uses its own label", () => {
        render(<FadeDots label="Waiting for the agent" />);
        expect(screen.getByRole("status", { name: "Waiting for the agent" })).toBeTruthy();
    });
});
