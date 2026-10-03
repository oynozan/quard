import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiquidMetalButton } from "./liquid-metal-button";

const shader = vi.hoisted(() => {
    const setSpeed = vi.fn();
    const dispose = vi.fn();
    const state = { fail: false };
    const ShaderMount = vi.fn(function (this: object) {
        if (state.fail) throw new Error("no WebGL");
        Object.assign(this, { setSpeed, dispose });
    });
    return { setSpeed, dispose, state, ShaderMount };
});

vi.mock("@paper-design/shaders", () => ({
    ShaderMount: shader.ShaderMount,
    liquidMetalFragmentShader: "liquid-metal-shader",
    LiquidMetalShapes: { none: 0 },
}));

function stubMotion(reduced: boolean) {
    vi.stubGlobal(
        "matchMedia",
        vi.fn(() => ({ matches: reduced })),
    );
}

beforeEach(() => {
    stubMotion(false);
    shader.state.fail = false;
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
    shader.ShaderMount.mockClear();
    shader.setSpeed.mockClear();
    shader.dispose.mockClear();
});

function surface(name = "Deploy") {
    return screen.getByRole("button", { name });
}

// The darkness of the rim's outer edge tells the resting, hovered and pressed shadows apart
const EDGE: Record<string, string> = { "0.3": "rest", "0.4": "hover", "0.5": "pressed" };

function look(container: HTMLElement) {
    const shadow = container.querySelector<HTMLElement>(".z-10")!.style.boxShadow;
    return EDGE[/^0 0 0 1px rgba\(0,0,0,([\d.]+)\)/.exec(shadow)![1]];
}

function plateShadow(container: HTMLElement) {
    return container.querySelector<HTMLElement>(".z-20")!.style.boxShadow;
}

function ripples(container: HTMLElement) {
    return [...container.querySelectorAll<HTMLElement>(".liquid-ripple")];
}

async function mounted() {
    await waitFor(() => expect(shader.ShaderMount).toHaveBeenCalledTimes(1));
}

describe("LiquidMetalButton", () => {
    it("shows its label at rest and starts the chrome rim at the resting speed", async () => {
        const { container } = render(<LiquidMetalButton label="Deploy" title="Deploy the agent" />);
        await mounted();
        const [node, fragment, uniforms, , speed] = shader.ShaderMount.mock.calls[0] as unknown[];
        expect(container.contains(node as Node)).toBe(true);
        expect(fragment).toBe("liquid-metal-shader");
        expect(uniforms).toMatchObject({ u_shape: 0, u_repetition: 4 });
        expect(speed).toBe(0.6);
        expect(surface().getAttribute("title")).toBe("Deploy the agent");
        expect(screen.getByText("Deploy")).toBeTruthy();
        expect(look(container)).toBe("rest");
        expect(plateShadow(container)).toBe("none");
        expect(container.firstElementChild?.className).toContain("w-[142px]");
    });

    it("lifts on hover, presses in on mouse down and settles back", async () => {
        const { container } = render(<LiquidMetalButton label="Deploy" />);
        await mounted();
        fireEvent.mouseEnter(surface());
        expect(look(container)).toBe("hover");
        expect(shader.setSpeed).toHaveBeenLastCalledWith(1);
        fireEvent.mouseDown(surface());
        expect(look(container)).toBe("pressed");
        expect(plateShadow(container)).toContain("inset");
        fireEvent.mouseUp(surface());
        expect(look(container)).toBe("hover");
        fireEvent.mouseLeave(surface());
        expect(look(container)).toBe("rest");
        expect(shader.setSpeed).toHaveBeenLastCalledWith(0.6);
    });

    it("rests after a press that ends without hover", () => {
        const { container } = render(<LiquidMetalButton label="Deploy" />);
        fireEvent.mouseDown(surface());
        fireEvent.mouseUp(surface());
        expect(look(container)).toBe("rest");
    });

    it("presses in from Enter or Space and ignores other keys", () => {
        const { container } = render(<LiquidMetalButton label="Deploy" />);
        fireEvent.keyDown(surface(), { key: "a" });
        expect(look(container)).toBe("rest");
        fireEvent.keyDown(surface(), { key: "Enter" });
        expect(look(container)).toBe("pressed");
        fireEvent.keyUp(surface(), { key: "Enter" });
        expect(look(container)).toBe("rest");
        fireEvent.keyDown(surface(), { key: " " });
        expect(look(container)).toBe("pressed");
    });

    it("runs the action, spins the rim up and ripples from the click point", async () => {
        const onClick = vi.fn();
        const { container } = render(<LiquidMetalButton label="Deploy" onClick={onClick} />);
        await mounted();
        vi.useFakeTimers({ now: new Date("2026-10-03T12:00:00Z") });
        vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ left: 100, top: 50 } as DOMRect);
        fireEvent.mouseEnter(surface());
        fireEvent.click(surface(), { clientX: 130, clientY: 70 });
        expect(onClick).toHaveBeenCalledTimes(1);
        expect(shader.setSpeed).toHaveBeenLastCalledWith(2.4);
        const [ripple] = ripples(container);
        expect([ripple.style.left, ripple.style.top]).toEqual(["20px", "10px"]);
        act(() => vi.advanceTimersByTime(300));
        expect(shader.setSpeed).toHaveBeenLastCalledWith(1);
        act(() => vi.advanceTimersByTime(300));
        expect(ripples(container)).toHaveLength(0);
    });

    it("slows to the resting speed after a click if the pointer left meanwhile", async () => {
        render(<LiquidMetalButton label="Deploy" />);
        await mounted();
        vi.useFakeTimers();
        fireEvent.mouseEnter(surface());
        fireEvent.click(surface());
        fireEvent.mouseLeave(surface());
        shader.setSpeed.mockClear();
        act(() => vi.advanceTimersByTime(300));
        expect(shader.setSpeed.mock.calls).toEqual([[0.6]]);
    });

    it("leaves the rim alone when the timer after a press fires once the button is gone", async () => {
        const { unmount } = render(<LiquidMetalButton label="Deploy" />);
        await mounted();
        vi.useFakeTimers();
        fireEvent.click(surface());
        unmount();
        vi.unstubAllGlobals();
        shader.setSpeed.mockClear();

        expect(() => vi.advanceTimersByTime(300)).not.toThrow();
        expect(shader.setSpeed).not.toHaveBeenCalled();
    });

    it("clears the timers a click started when it goes away", async () => {
        const { unmount } = render(<LiquidMetalButton label="Deploy" />);
        await mounted();
        vi.useFakeTimers();
        fireEvent.click(surface());
        expect(vi.getTimerCount()).toBe(2);
        unmount();
        expect(vi.getTimerCount()).toBe(0);
    });

    it("keeps the rim still and skips the ripple for reduced motion", async () => {
        stubMotion(true);
        const onClick = vi.fn();
        const { container } = render(<LiquidMetalButton label="Deploy" onClick={onClick} />);
        await mounted();
        expect((shader.ShaderMount.mock.calls[0] as unknown[])[4]).toBe(0);
        fireEvent.mouseEnter(surface());
        fireEvent.click(surface());
        expect(shader.setSpeed).not.toHaveBeenCalled();
        expect(ripples(container)).toHaveLength(0);
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("links to a page and can fill its row", () => {
        const { container } = render(<LiquidMetalButton label="Open fleet" href="/fleet" fullWidth />);
        const link = screen.getByRole("link", { name: "Open fleet" });
        expect(link.getAttribute("href")).toBe("/fleet");
        expect(link.className).toContain("cursor-pointer");
        expect(container.firstElementChild?.className).toContain("w-full");
    });

    it("is a faded, disabled button even with a link, and ignores presses", () => {
        const onClick = vi.fn();
        const { container } = render(<LiquidMetalButton label="Deploy" href="/deploy" onClick={onClick} disabled />);
        expect(screen.queryByRole("link")).toBeNull();
        const button = surface();
        expect(button.hasAttribute("disabled")).toBe(true);
        expect(button.className).toContain("cursor-not-allowed");
        expect((container.firstElementChild as HTMLElement).style.opacity).toBe("0.45");
        fireEvent.mouseEnter(button);
        fireEvent.mouseDown(button);
        expect(look(container)).toBe("rest");
        expect(shader.setSpeed).not.toHaveBeenCalled();
        fireEvent.keyDown(button, { key: "Enter" });
        fireEvent.click(button);
        expect(look(container)).toBe("rest");
        expect(onClick).not.toHaveBeenCalled();
    });

    it("stops the shader when removed", async () => {
        const { unmount } = render(<LiquidMetalButton label="Deploy" />);
        await mounted();
        unmount();
        expect(shader.dispose).toHaveBeenCalledTimes(1);
    });

    it("never starts the shader when removed before it loads", async () => {
        const { unmount } = render(<LiquidMetalButton label="Deploy" />);
        unmount();
        await import("@paper-design/shaders");
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(shader.ShaderMount).not.toHaveBeenCalled();
    });

    it("still works as a plain plate without WebGL", async () => {
        shader.state.fail = true;
        const onClick = vi.fn();
        const { container, unmount } = render(<LiquidMetalButton label="Deploy" onClick={onClick} />);
        await mounted();
        fireEvent.mouseEnter(surface());
        fireEvent.click(surface());
        expect(look(container)).toBe("hover");
        expect(onClick).toHaveBeenCalledTimes(1);
        unmount();
        expect(shader.dispose).not.toHaveBeenCalled();
    });
});
