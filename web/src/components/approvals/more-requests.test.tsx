import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MoreRequests } from "./more-requests";

const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

afterEach(() => {
    router.replace.mockReset();
});

describe("MoreRequests", () => {
    it("lists one more step of open requests, in place", () => {
        render(<MoreRequests more={250} shown={100} />);
        fireEvent.click(screen.getByRole("button", { name: "Show 100 more" }));
        expect(router.replace).toHaveBeenCalledWith("/approvals?shown=200", { scroll: false });
    });

    it("counts only the requests that are left", () => {
        render(<MoreRequests more={6} shown={300} />);
        fireEvent.click(screen.getByRole("button", { name: "Show 6 more" }));
        expect(router.replace).toHaveBeenCalledWith("/approvals?shown=400", { scroll: false });
    });
});
