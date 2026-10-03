import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Spinner } from "./spinner";

const buttonVariants = cva(
    "inline-flex shrink-0 items-center justify-center gap-[7px] whitespace-nowrap rounded-md border border-transparent select-none [&_svg]:pointer-events-none [&_svg]:shrink-0",
    {
        variants: {
            variant: {
                default: "bg-signal font-medium text-on-signal enabled:hover:bg-mint",
                outline:
                    "bg-control-hover font-[450] text-ink-soft enabled:hover:bg-highlight enabled:hover:text-ink-bright",
                ghost: "font-[450] text-ink-2 enabled:hover:bg-control-hover enabled:hover:text-ink-bright",
                link: "min-h-0 border-0 p-0 text-[13px] text-ink-link enabled:hover:text-ink-bright",
                destructive:
                    "bg-caution-border/55 font-medium text-caution-text enabled:hover:bg-caution-border enabled:hover:text-ink-bright",
            },
            size: {
                default: "min-h-[34px] px-[14px] py-[7px] text-[14px]",
                sm: "min-h-[30px] px-[11px] py-[5px] text-[13px]",
                tall: "min-h-[46px] px-[16px] py-[7px] text-[14px]",
                icon: "size-8 p-0 max-[760px]:min-h-[34px]",
                "icon-sm": "size-6 p-0",
                "icon-xs": "size-5 p-0",
            },
        },
        compoundVariants: [{ variant: "link", class: "min-h-0 px-0 py-0 text-[13px]" }],
        defaultVariants: {
            variant: "outline",
            size: "default",
        },
    },
);

type ButtonProps = ButtonPrimitive.Props &
    VariantProps<typeof buttonVariants> & {
        // While busy the label should name the step in progress, ending in "…"
        busy?: boolean;
    };

function Button({
    className,
    variant = "outline",
    size = "default",
    busy = false,
    disabled,
    children,
    ...props
}: ButtonProps) {
    return (
        <ButtonPrimitive
            data-slot="button"
            className={cn(buttonVariants({ variant, size, className }), busy && "gap-[9px]")}
            disabled={disabled || busy}
            aria-busy={busy || undefined}
            {...props}
        >
            {busy ? <Spinner /> : null}
            {children}
        </ButtonPrimitive>
    );
}

export { Button, buttonVariants };
