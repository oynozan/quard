import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { RunWarning } from "@/lib/data/runs/types";
import { RunWarnings } from "./run-warnings";

function warning(fields: Partial<RunWarning> = {}): RunWarning {
    return {
        agent: "billing",
        stepId: null,
        at: 0,
        code: "unwrapped_tool",
        tool: "payInvoice",
        reason: null,
        ...fields,
    };
}

// Each warning rule as headline and note
function rules(warnings: RunWarning[]): string[] {
    render(<RunWarnings warnings={warnings} />);
    const region = screen.getByRole("region", { name: "Warnings" });
    return [...region.children].map((rule) => [...rule.querySelectorAll("p")].map((p) => p.textContent).join(" | "));
}

describe("RunWarnings", () => {
    it("shows nothing when the SDK warned of nothing", () => {
        const { container } = render(<RunWarnings warnings={[]} />);
        expect(container.innerHTML).toBe("");
    });

    it("puts every warning code the SDK records in plain words", () => {
        expect(
            rules([
                warning(),
                warning({ tool: null }),
                warning({ code: "detector_error", tool: "fetchPage", reason: "timeout" }),
                warning({ code: "detector_error", tool: null }),
                warning({ code: "unreadable_request", tool: null }),
                warning({ code: "unguarded_x402", tool: null }),
                warning({ code: "label_record_not_stored", tool: null }),
                warning({ code: "label_record_not_found", tool: null }),
            ]),
        ).toEqual([
            "payInvoice is not wrapped with guard(), so it is recorded but never stopped | By billing",
            "A tool is not wrapped with guard(), so it is recorded but never stopped | By billing",
            "The detector could not check what fetchPage returned: timeout | By billing",
            "The detector could not check what a tool returned | By billing",
            "A model request could not be read, so its call was not checked | By billing",
            "A signed payment was not sent, because no x402 guard checked it | By billing",
            "A message's labels could not be stored, so its receiver reads it as untrusted | By billing",
            "A received message had no stored labels, so it was not verified | By billing",
        ]);
    });

    it("shows a code it does not know as the code", () => {
        expect(rules([warning({ code: "new_thing", tool: null })])).toEqual(["The SDK warned new_thing | By billing"]);
    });

    it("shows the same warning from one agent once, with how often it came", () => {
        expect(
            rules([warning(), warning({ at: 5 }), warning({ agent: "researcher" }), warning({ tool: "refund" })]),
        ).toEqual([
            "payInvoice is not wrapped with guard(), so it is recorded but never stopped | By billing · 2 times",
            "payInvoice is not wrapped with guard(), so it is recorded but never stopped | By researcher",
            "refund is not wrapped with guard(), so it is recorded but never stopped | By billing",
        ]);
    });
});
