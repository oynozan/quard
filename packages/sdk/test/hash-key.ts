import { parseHashKey, projectHashKey } from "@quard/shared";

// The install's hash key, which only the server holds
const INSTALL_KEY = parseHashKey("ab".repeat(32));

export const TEST_PROJECT = "project-test";

// The key the server hands out to agents of a project, as webhook and control do
export function projectKeyOf(project: string): string {
    return projectHashKey(INSTALL_KEY, project).toString("hex");
}

// The test project's key, as its agents get it
export const PROJECT_KEY_TEXT = projectKeyOf(TEST_PROJECT);
export const PROJECT_KEY = parseHashKey(PROJECT_KEY_TEXT);

// What webhook answers an agent of the test project that asks for its key
export function hashKeyAnswer(): Response {
    return new Response(JSON.stringify({ hashKey: PROJECT_KEY_TEXT }), { status: 200 });
}
