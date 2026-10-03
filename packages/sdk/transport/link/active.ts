import type { Control } from "./control.ts";

let current: Control | undefined;

// The link to control that configureQuard started, if any
export function activeControl(): Control | undefined {
    return current;
}

export function setActiveControl(control: Control | undefined): void {
    current = control;
}

// Sends the active rules to control when they changed
export function syncRules(): void {
    current?.syncRules();
}
