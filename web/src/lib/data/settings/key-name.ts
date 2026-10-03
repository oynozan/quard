// Shared by the key form and the server action, so both apply the same rules
export const NAME_LIMIT = 48;

// A name problem, or null when the name is fine, where taken holds the active keys' names
export function nameProblem(name: string, taken: string[]): string | null {
    const value = name.trim();
    if (value.length === 0) return "Give the key a name, such as the app that will use it.";
    if (value.length > NAME_LIMIT) return `Keep the name under ${NAME_LIMIT} characters.`;
    if (taken.includes(value)) return "An active key already has this name.";
    return null;
}
