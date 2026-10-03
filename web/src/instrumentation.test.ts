// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const migrateOnStart = vi.fn(async () => undefined);
vi.mock("./lib/db/migrate-on-start", () => ({ migrateOnStart: () => migrateOnStart() }));

const { register } = await import("./instrumentation");

describe("register", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        migrateOnStart.mockClear();
    });

    it("migrates on the Node server", async () => {
        vi.stubEnv("NEXT_RUNTIME", "nodejs");
        await register();
        expect(migrateOnStart).toHaveBeenCalledOnce();
    });

    it("does nothing on the Edge runtime", async () => {
        vi.stubEnv("NEXT_RUNTIME", "edge");
        await register();
        expect(migrateOnStart).not.toHaveBeenCalled();
    });
});
