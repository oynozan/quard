"use client";

import { useEffect, useState } from "react";

// The skill's folder under skills/ and the name in its SKILL.md
export const SKILL = "quard";

export const COMMAND = `npx skills add oynozan/quard --skill ${SKILL}`;

// How long "Copied" shows after a click
export const COPIED_MS = 1200;

// The command that installs the Quard skill into an AI coding agent. One click copies it.
export function InstallSkill() {
    // Counts clicks while "Copied" shows, so each click restarts the timer. 0 hides it.
    const [copies, setCopies] = useState(0);

    useEffect(() => {
        if (copies === 0) return;
        const timer = setTimeout(() => setCopies(0), COPIED_MS);
        return () => clearTimeout(timer);
    }, [copies]);

    async function copy() {
        // The clipboard can be refused, and a quiet no beats an error on every page
        try {
            await navigator.clipboard.writeText(COMMAND);
        } catch {
            return;
        }
        setCopies((count) => count + 1);
    }

    const copied = copies > 0;
    return (
        <button
            type="button"
            className="quard-skill-cmd"
            data-copied={copied || undefined}
            data-pagefind-ignore="all"
            onClick={copy}
            aria-label="Copy the command that installs the Quard skill"
        >
            <span aria-hidden className="quard-skill-cmd-prompt">
                $
            </span>
            <code>{COMMAND}</code>
            <span aria-live="polite" className="quard-skill-cmd-state">
                {copied ? "Copied" : "Copy"}
            </span>
        </button>
    );
}
