import { describe, expect, it } from "vitest";
import { GuardRefusal } from "../../core/refusal.ts";
import { inFrame, newFrame, noteRefused } from "./frame.ts";

const refusal = new GuardRefusal({ guard: "x402", tool: "x402", reason: "x402_host_blocked" });

describe("payment frames", () => {
    it("keeps a refusal for the tool that runs", async () => {
        const frame = newFrame();

        await inFrame(frame, async () => noteRefused({ refusal, onBlock: "return" }));

        expect(frame.refused?.refusal).toBe(refusal);
    });

    it("drops a refusal made outside any guarded tool", () => {
        expect(() => noteRefused({ refusal, onBlock: "return" })).not.toThrow();
    });
});
