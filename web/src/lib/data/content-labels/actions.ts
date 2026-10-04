"use server";

import { reviewChunk } from "@quard/db";
import { LABEL_NAME } from "@quard/shared";
import { revalidatePath } from "next/cache";
import { displayName } from "@/lib/auth/access";
import { actionScope } from "../scope";

const EVENT_ID = /^[0-9a-f]{16}$/;

// Saves the label a person says is right for a chunk, with who said it.
// False when the project has no such chunk.
export async function reviewLabel(eventId: string, label: string): Promise<boolean> {
    const scope = await actionScope();
    if (typeof eventId !== "string" || !EVENT_ID.test(eventId)) {
        throw new Error("Not a chunk id");
    }
    if (typeof label !== "string" || !LABEL_NAME.test(label)) {
        throw new Error("Not a label name");
    }
    const saved = scope
        ? await reviewChunk(scope.db, scope.project.id, eventId, label, displayName(scope.session))
        : false;
    revalidatePath("/labels");
    return saved;
}
