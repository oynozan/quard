import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AuthLayout from "./layout";

describe("AuthLayout", () => {
    it("puts the page in the main landmark that the skip link targets", () => {
        render(<AuthLayout params={Promise.resolve({})}>{<h1>Sign in</h1>}</AuthLayout>);
        const main = screen.getByRole("main");
        expect(main.id).toBe("content");
        expect(main.textContent).toBe("Sign in");
    });
});
