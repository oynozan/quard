import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { openRequest } from "../../../test/approvals/requests";
import { ArgumentList } from "./argument-list";

describe("ArgumentList", () => {
    it("shows every argument with its full value, not the masked one", () => {
        const { container } = render(<ArgumentList args={openRequest("apr_7f31").args} />);
        const names = [...container.querySelectorAll("dt")].map((node) => node.textContent);
        expect(names).toEqual(["iban", "amount", "reference"]);
        expect(screen.getByText("DE89 3704 0044 0532 0130 00")).toBeTruthy();
        expect(screen.queryByText("DE89…3000")).toBeNull();
    });

    it("lists only the untrusted origins of a value", () => {
        render(<ArgumentList args={openRequest("apr_7f31").args} />);
        const origins = within(screen.getByRole("list", { name: "Untrusted origins of reference" }));
        const chips = origins.getAllByRole("listitem").map((item) => item.textContent);
        expect(chips).toEqual(["web:supplier-portal.exampleuntrusted", "agent:researcheruntrusted"]);
        expect(screen.queryByText("tool:lookup_supplier")).toBeNull();
    });

    it("flags a model-generated value instead of listing origins", () => {
        render(<ArgumentList args={openRequest("apr_7f1e").args} />);
        expect(screen.getAllByText("model-generated")).toHaveLength(1);
        const commit = screen.getByText("a41c9e0f").closest("dd");
        expect(commit?.textContent).toBe("a41c9e0fmodel-generated");
    });

    it("adds no flag when every origin is trusted or there is none", () => {
        render(<ArgumentList args={openRequest("apr_7f0a").args} />);
        expect(screen.queryByRole("list")).toBeNull();
        expect(screen.queryByText("model-generated")).toBeNull();
        expect(screen.getByText("NL91 ABNA 0417 1643 00").closest("dd")?.textContent).toBe("NL91 ABNA 0417 1643 00");
    });
});
