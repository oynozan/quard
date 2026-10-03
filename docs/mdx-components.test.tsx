import { describe, expect, it, vi } from "vitest";
import { useMDXComponents } from "./mdx-components";

const themeA = vi.hoisted(() => () => null);
const ownA = () => null;
vi.mock("nextra-theme-docs", () => ({ useMDXComponents: () => ({ a: themeA, p: "p" }) }));

describe("useMDXComponents", () => {
    it("starts from the docs theme components", () => {
        expect(useMDXComponents()).toEqual({ a: themeA, p: "p" });
    });

    it("lets a page override a theme component", () => {
        expect(useMDXComponents({ a: ownA })).toEqual({ a: ownA, p: "p" });
    });
});
