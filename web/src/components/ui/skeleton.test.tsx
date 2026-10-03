import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Skeleton } from "./skeleton";

function bar(container: HTMLElement) {
    return container.firstElementChild as HTMLElement;
}

describe("Skeleton", () => {
    it("is a hidden 72 by 12 bar by default", () => {
        const { container } = render(<Skeleton />);
        expect(bar(container).getAttribute("aria-hidden")).toBe("true");
        expect(bar(container).style.width).toBe("72px");
        expect(bar(container).style.height).toBe("12px");
    });

    it("takes the size of the value it stands in for", () => {
        const { container } = render(<Skeleton width="40%" height={20} className="extra" />);
        expect(bar(container).style.width).toBe("40%");
        expect(bar(container).style.height).toBe("20px");
        expect(bar(container).className).toBe("skel extra");
    });
});
