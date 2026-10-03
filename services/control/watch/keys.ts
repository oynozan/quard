import { revokedKeyIds } from "@quard/db";
import { CLOSE_CODES } from "@quard/shared";
import type { Context } from "../server/context.ts";

// The SDKs of a revoked key warn and keep retrying with backoff
export async function closeRevoked(ctx: Context, keyIds: string[] = ctx.registry.keyIds()): Promise<void> {
    if (keyIds.length === 0) {
        return;
    }
    for (const keyId of await revokedKeyIds(ctx.db, keyIds)) {
        for (const connection of ctx.registry.withKey(keyId)) {
            connection.socket.close(CLOSE_CODES.revoked, "agent key revoked");
        }
    }
}
