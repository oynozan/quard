import { render, screen } from "@testing-library/react";
import type { QuarantinedValue } from "@/lib/data/fleet";
import { describe, expect, it } from "vitest";
import { KIND_NAMES, ValueCell } from "./value-cell";

describe("ValueCell", () => {
    it("shows the masked value over its field, titled with the kind", () => {
        const { container } = render(<ValueCell value={{ kind: "iban", field: "iban", value: "DE89 •••• 3000" }} />);
        expect(screen.getByText("DE89 •••• 3000").tagName).toBe("STRONG");
        expect(screen.getByText("iban").tagName).toBe("SMALL");
        expect(container.firstElementChild?.getAttribute("title")).toBe("IBAN DE89 •••• 3000");
    });

    it("draws a bank for an IBAN, a letter for an email and a globe for a domain", () => {
        const icons = { iban: "lucide-landmark", email: "lucide-mail", domain: "lucide-globe" } as const;
        for (const [kind, icon] of Object.entries(icons)) {
            const value = { kind: kind as QuarantinedValue["kind"], field: "to", value: "x" };
            const { container, unmount } = render(<ValueCell value={value} />);
            const svg = container.querySelector("svg");
            expect(svg?.getAttribute("aria-hidden")).toBe("true");
            expect(svg?.classList.contains(icon)).toBe(true);
            unmount();
        }
    });

    it("names each kind in plain words", () => {
        expect(KIND_NAMES).toEqual({ iban: "IBAN", email: "Email", domain: "Domain" });
    });
});
