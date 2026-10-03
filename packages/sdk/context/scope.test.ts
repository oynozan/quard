import { afterEach, describe, expect, it } from "vitest";
import { configure, resetConfig } from "../core/config.ts";
import { takeEvents } from "../core/recorder.ts";
import { agentScope, currentScope, mayUse, narrowTools, newScope, runScope } from "./scope.ts";

afterEach(() => {
    resetConfig();
    takeEvents();
});

describe("newScope", () => {
    it("records the run with the origin overrides in force", () => {
        configure({ origins: { "mcp:crm": { trust: "trusted" } } });
        const scope = newScope({ agent: "billing" });

        expect(takeEvents()).toEqual([
            expect.objectContaining({
                type: "run_started",
                runId: scope.run.runId,
                agent: "billing",
                origins: { "mcp:crm": { trust: "trusted" } },
            }),
        ]);
    });
});

describe("runScope", () => {
    it("shares one run across awaits", async () => {
        await runScope({ agent: "billing" }, async () => {
            const before = currentScope();
            await new Promise((resolve) => setTimeout(resolve, 1));

            expect(currentScope()).toBe(before);
            expect(before?.agent).toBe("billing");
        });
        expect(currentScope()).toBeUndefined();
    });

    it("uses the default agent and every tool when no options are given", () => {
        const scope = newScope();

        expect(scope.agent).toBe("default");
        expect(scope.tools).toBeUndefined();
        expect(mayUse(scope, "anything")).toBe(true);
    });

    it("limits tools when a list is given", () => {
        const scope = newScope({ tools: ["fetchPage"], runId: "4bf92f3577b34da6a3ce929d0e0e4736" });

        expect(mayUse(scope, "fetchPage")).toBe(true);
        expect(mayUse(scope, "payInvoice")).toBe(false);
        expect(scope.run.runId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
    });
});

describe("agentScope", () => {
    it("runs a child agent in the same run with the parent step", () => {
        runScope({ agent: "orchestrator" }, () => {
            const parent = currentScope();
            if (parent) {
                parent.lastStepId = "00f067aa0ba902b7";
            }

            agentScope("researcher", () => {
                const child = currentScope();

                expect(child?.agent).toBe("researcher");
                expect(child?.run).toBe(parent?.run);
                expect(child?.parentStepId).toBe("00f067aa0ba902b7");
            });
        });
    });

    it("narrows the parent's tools", () => {
        runScope({ tools: ["fetchPage", "payInvoice"] }, () => {
            agentScope(
                "reader",
                () => {
                    expect([...(currentScope()?.tools ?? [])]).toEqual(["fetchPage"]);
                },
                { tools: ["fetchPage", "deleteAll"] },
            );
        });
    });

    it("must be inside a run", () => {
        expect(() => agentScope("lost", () => {})).toThrow("quard.agent() must be called inside quard.run()");
    });
});

describe("narrowTools", () => {
    it("keeps the parent's tools when the child names none", () => {
        const parent = new Set(["a"]);

        expect(narrowTools(parent, undefined)).toBe(parent);
        expect(narrowTools(undefined, undefined)).toBeUndefined();
    });

    it("uses the child's list when the parent allows everything", () => {
        expect([...(narrowTools(undefined, ["a", "b"]) ?? [])]).toEqual(["a", "b"]);
    });
});
