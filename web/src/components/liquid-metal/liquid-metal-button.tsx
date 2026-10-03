"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { cn } from "@/lib/utils";

const SHADOW = {
    rest: "0 0 0 1px rgba(0,0,0,0.3), 0 36px 14px 0 rgba(0,0,0,0.02), 0 20px 12px 0 rgba(0,0,0,0.08), 0 9px 9px 0 rgba(0,0,0,0.12), 0 2px 5px 0 rgba(0,0,0,0.15)",
    hover: "0 0 0 1px rgba(0,0,0,0.4), 0 12px 6px 0 rgba(0,0,0,0.05), 0 8px 5px 0 rgba(0,0,0,0.1), 0 4px 4px 0 rgba(0,0,0,0.15), 0 1px 2px 0 rgba(0,0,0,0.2)",
    pressed: "0 0 0 1px rgba(0,0,0,0.5), 0 1px 2px 0 rgba(0,0,0,0.3)",
};

type Ripple = { id: number; x: number; y: number };

type LiquidMetalButtonProps = {
    label: string;
    href?: string;
    onClick?: () => void;
    fullWidth?: boolean;
    disabled?: boolean;
    title?: string;
    className?: string;
};

type Mount = { setSpeed: (speed: number) => void; dispose: () => void };

// A dark plate in a living 2px chrome rim. One per region, for its main action.
export function LiquidMetalButton({
    label,
    href,
    onClick,
    fullWidth,
    disabled,
    title,
    className,
}: LiquidMetalButtonProps) {
    const host = useRef<HTMLDivElement>(null);
    const mount = useRef<Mount | null>(null);
    const hovered = useRef(false);
    const [state, setState] = useState<"rest" | "hover" | "pressed">("rest");
    const [ripples, setRipples] = useState<Ripple[]>([]);

    useEffect(() => {
        // The host div always renders, so its ref is set before effects run
        const node = host.current!;
        let cancelled = false;
        const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        import("@paper-design/shaders").then(({ ShaderMount, liquidMetalFragmentShader, LiquidMetalShapes }) => {
            if (cancelled) return;
            try {
                mount.current = new ShaderMount(
                    node,
                    liquidMetalFragmentShader,
                    {
                        u_repetition: 4,
                        u_softness: 0.5,
                        u_shiftRed: 0.3,
                        u_shiftBlue: 0.3,
                        u_distortion: 0,
                        u_contour: 0,
                        u_angle: 45,
                        u_scale: 8,
                        u_shape: LiquidMetalShapes.none,
                        u_originX: 0.5,
                        u_originY: 0.5,
                        u_offsetX: 0,
                        u_offsetY: 0,
                    },
                    undefined,
                    still ? 0 : 0.6,
                );
            } catch {
                // Without WebGL the plate and its dark ring remain, and the button still works.
            }
        });
        return () => {
            cancelled = true;
            mount.current?.dispose();
            mount.current = null;
        };
    }, []);

    const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const speed = (value: number) => {
        if (!reducedMotion()) mount.current?.setSpeed(value);
    };

    // React sends no mouse events to a disabled button, so enter and press need no check
    function enter() {
        hovered.current = true;
        setState("hover");
        speed(1);
    }

    function leave() {
        hovered.current = false;
        setState("rest");
        speed(0.6);
    }

    function press(event: MouseEvent<HTMLElement>) {
        speed(2.4);
        setTimeout(() => speed(hovered.current ? 1 : 0.6), 300);
        if (!reducedMotion()) {
            const box = event.currentTarget.getBoundingClientRect();
            const ripple = { id: Date.now(), x: event.clientX - box.left, y: event.clientY - box.top };
            setRipples((list) => [...list, ripple]);
            setTimeout(() => setRipples((list) => list.filter((r) => r.id !== ripple.id)), 600);
        }
        onClick?.();
    }

    const surface = cn(
        "absolute inset-0 z-40 overflow-hidden rounded-md bg-transparent",
        disabled ? "cursor-not-allowed" : "cursor-pointer",
    );
    const surfaceEvents = {
        onMouseEnter: enter,
        onMouseLeave: leave,
        onMouseDown: () => !disabled && setState("pressed"),
        onMouseUp: () => !disabled && setState(hovered.current ? "hover" : "rest"),
        onKeyDown: (event: { key: string }) =>
            (event.key === " " || event.key === "Enter") && !disabled && setState("pressed"),
        onKeyUp: () => setState("rest"),
        onClick: press,
        "aria-label": label,
        title,
    };
    const rippleNodes = ripples.map((r) => (
        <span
            key={r.id}
            aria-hidden
            className="liquid-ripple pointer-events-none absolute size-5 rounded-full"
            style={{ left: r.x - 10, top: r.y - 10 }}
        />
    ));

    return (
        <div
            className={cn("liquid-metal relative isolate h-[46px]", fullWidth ? "w-full" : "w-[142px]", className)}
            style={{ opacity: disabled ? 0.45 : 1 }}
        >
            <div
                className="absolute inset-0 z-10 rounded-md"
                style={{ boxShadow: SHADOW[state], transition: "box-shadow 150ms cubic-bezier(0.4, 0, 0.2, 1)" }}
            >
                <div ref={host} className="absolute inset-0 overflow-hidden rounded-md [&_canvas]:rounded-md" />
                <div aria-hidden className="absolute inset-0 rounded-md bg-signal mix-blend-multiply" />
            </div>
            <div
                className="absolute inset-[2px] z-20 rounded-sm"
                style={{
                    background: "linear-gradient(21deg, #1c1c1c 0%, #212121 100%)",
                    boxShadow:
                        state === "pressed"
                            ? "inset 0 2px 4px rgba(0,0,0,0.4), inset 0 1px 2px rgba(0,0,0,0.3)"
                            : "none",
                }}
            />
            <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center gap-[6px] text-[14px] text-[#fdfdfd] [text-shadow:0_1px_2px_rgba(0,0,0,0.5)]">
                <span className="whitespace-nowrap">{label}</span>
            </div>
            {href && !disabled ? (
                <Link href={href} className={surface} {...surfaceEvents}>
                    {rippleNodes}
                </Link>
            ) : (
                <button type="button" disabled={disabled} className={surface} {...surfaceEvents}>
                    {rippleNodes}
                </button>
            )}
        </div>
    );
}
