import { z } from "zod";

// One readable line or block for config and feed errors.
export function describeError(error: unknown): string {
    if (error instanceof z.ZodError) {
        return z.prettifyError(error);
    }
    return error instanceof Error ? error.message : String(error);
}
