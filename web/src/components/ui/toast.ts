import { toast } from "sonner";

// The id defaults to the message, so a repeat updates the toast in place and restarts its timer
export function showToast(message: string, id: string = message) {
    toast(message, { id });
}

// Copies text on the page and reports it with a toast, while the drawer uses CopyButton instead
export async function copyWithToast(value: string, what: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(value);
        showToast(`${what} copied`, "clipboard");
        return true;
    } catch {
        showToast(`Could not copy ${what.toLowerCase()}`, "clipboard");
        return false;
    }
}
