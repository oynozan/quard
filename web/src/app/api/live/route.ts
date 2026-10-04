import { getSession } from "@/lib/auth/session";
import { database } from "@/lib/data/runs/live/client";
import { currentProject } from "@/lib/data/runs/live/project";
import { liveHub } from "@/lib/live/hub";
import { SSE_HEADERS } from "@/lib/live/sse";
import { liveStream } from "@/lib/live/stream";

// A long-lived stream per request: never cached, never prerendered, on Node
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Tells a signed-in tab when runs, approvals or the fleet change
export async function GET(request: Request) {
    if (!(await getSession())) {
        return new Response(null, { status: 401, headers: { "Cache-Control": "no-store" } });
    }
    const project = await currentProject(database());
    // A configured id that matches no project still scopes the stream, so it hears nothing
    const scope = project?.id ?? (process.env.QUARD_PROJECT_ID?.trim() || undefined);
    return new Response(liveStream(scope, request.signal, liveHub()), { headers: SSE_HEADERS });
}
