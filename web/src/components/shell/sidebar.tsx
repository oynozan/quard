"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { LiquidMetalButton } from "@/components/liquid-metal/liquid-metal-button";
import { QuardWordmark } from "./quard-mark";
import { UserRow } from "./user-row";
import { isActive, PRIMARY_NAV, WORKSPACE_NAV, type NavItem } from "./nav-config";

// Each row fades in one step later than the row above it.
const step = (index: number): CSSProperties => ({ animationDelay: `${index * 50}ms` });

type SidebarProps = {
    openApprovals: number;
    account: { email: string; role: string };
    onNavigate?: () => void;
};

export function Sidebar({ openApprovals, account, onNavigate }: SidebarProps) {
    const pathname = usePathname();

    return (
        <>
            <div
                className="reveal-row flex h-[75px] shrink-0 items-center px-[23px] max-[1250px]:px-[22px]"
                style={step(0)}
            >
                <Link href="/" aria-label="Quard overview" onClick={onNavigate} className="rounded-sm">
                    <QuardWordmark />
                </Link>
            </div>

            <nav aria-label="Main" className="px-3 pt-3 pb-[18px]">
                <ul>
                    {PRIMARY_NAV.map((item, i) => (
                        <li key={item.href} className="reveal-row" style={step(i + 2)}>
                            <NavLink
                                item={item}
                                active={isActive(item, pathname)}
                                count={item.href === "/approvals" ? openApprovals : undefined}
                                onNavigate={onNavigate}
                            />
                        </li>
                    ))}
                </ul>
            </nav>

            <div className="mt-auto">
                <nav aria-label="Workspace" className="px-3 pb-[18px]">
                    <span
                        className="reveal-row block px-[11px] pb-[10px] text-[12px] font-light tracking-[0.085em] text-ink-faint uppercase"
                        style={step(10)}
                    >
                        Workspace
                    </span>
                    <ul>
                        {WORKSPACE_NAV.map((item, i) => (
                            <li key={item.href} className="reveal-row" style={step(11 + i)}>
                                <NavLink item={item} active={isActive(item, pathname)} onNavigate={onNavigate} />
                            </li>
                        ))}
                    </ul>
                </nav>

                <div className="reveal-row flex px-3 pb-6" style={step(12)}>
                    <LiquidMetalButton
                        label={approvalsLabel(openApprovals)}
                        href="/approvals"
                        onClick={onNavigate}
                        fullWidth
                    />
                </div>

                <UserRow title={account.email} sub={account.role} style={step(15)} onNavigate={onNavigate} />
            </div>
        </>
    );
}

function approvalsLabel(open: number): string {
    if (open === 0) return "Open approvals";
    return `Review ${open} ${open === 1 ? "approval" : "approvals"}`;
}

type NavLinkProps = { item: NavItem; active: boolean; count?: number; onNavigate?: () => void };

function NavLink({ item, active, count, onNavigate }: NavLinkProps) {
    const Icon = item.icon;
    return (
        <Link
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
                "group flex min-h-[37px] w-full items-center gap-[10px] rounded-md border px-[10px] py-[7px] text-[14px] max-[760px]:min-h-[34px]",
                active
                    ? "border-transparent bg-selected text-signal"
                    : "border-transparent text-ink-2 hover:bg-nav-hover hover:text-ink-bright",
            )}
        >
            <Icon
                aria-hidden
                size={20}
                strokeWidth={0.75}
                className={cn(
                    "transition-opacity duration-150",
                    active ? "opacity-100" : "opacity-60 group-hover:opacity-85",
                )}
            />
            {item.label}
            {count ? (
                <span className="mono ml-auto rounded-sm bg-tile px-[5px] text-[12px] leading-[18px] text-ink-note">
                    {count}
                </span>
            ) : null}
        </Link>
    );
}
