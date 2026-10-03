// The time of day is UTC, like every clock on the dashboard
export function greetingFor(now: number, running: number): string {
    const hour = new Date(now).getUTCHours();
    const part = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    const agents = running === 0 ? "No agents are" : running === 1 ? "One agent is" : `${running} agents are`;
    return `${part}. ${agents} running.`;
}
