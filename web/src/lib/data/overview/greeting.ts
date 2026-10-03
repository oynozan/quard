// Greets by the UTC hour, and counts running agents unless it is a new install with none yet
export function greetingFor(now: number, running?: number): string {
    const hour = new Date(now).getUTCHours();
    const part = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    if (running === undefined) return `${part}.`;
    const agents = running === 0 ? "No agents are" : running === 1 ? "One agent is" : `${running} agents are`;
    return `${part}. ${agents} running.`;
}
