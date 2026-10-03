// The time of day is UTC, like every clock on the dashboard. Without a running
// count (a new install) it is only the greeting, since the line under it says the rest.
export function greetingFor(now: number, running?: number): string {
    const hour = new Date(now).getUTCHours();
    const part = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    if (running === undefined) return `${part}.`;
    const agents = running === 0 ? "No agents are" : running === 1 ? "One agent is" : `${running} agents are`;
    return `${part}. ${agents} running.`;
}
