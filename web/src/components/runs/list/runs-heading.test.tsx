import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RunsHeading } from "./runs-heading";

function heading() {
    return screen.getByRole("heading", { level: 1 });
}

describe("RunsHeading", () => {
    it("shows the title with the number of runs", () => {
        render(<RunsHeading count={42} />);
        expect(heading().textContent).toBe("Runs42");
        expect(screen.getByTitle("Runs").textContent).toBe("42");
    });

    it("explains that a filtered count is the runs that match", () => {
        render(<RunsHeading count={3} filtered />);
        expect(screen.getByTitle("Runs that match the filters").textContent).toBe("3");
    });

    it("shows a placeholder while the count loads", () => {
        render(<RunsHeading count={null} />);
        expect(heading().textContent).toBe("Runs");
        expect(heading().querySelector("[title]")).toBeNull();
        expect(heading().children).toHaveLength(1);
    });

    it("shows only the title when there is no count", () => {
        render(<RunsHeading />);
        expect(heading().textContent).toBe("Runs");
        expect(heading().children).toHaveLength(0);
    });

    it("shows a count of zero as 0", () => {
        render(<RunsHeading count={0} />);
        expect(heading().textContent).toBe("Runs0");
        expect(screen.getByTitle("Runs").textContent).toBe("0");
    });

    it("shows 0 for filters that match nothing", () => {
        render(<RunsHeading count={0} filtered />);
        expect(screen.getByTitle("Runs that match the filters").textContent).toBe("0");
    });
});
