// @vitest-environment node
import type { Db } from "@quard/db";
import { afterEach, describe, expect, it, vi } from "vitest";

const findProject = vi.hoisted(() => vi.fn(async (_db: unknown, id: string) => ({ id, name: "Picked" })));
const firstProject = vi.hoisted(() => vi.fn(async () => ({ id: "first", name: "First" })));
vi.mock("@quard/db", () => ({ findProject, firstProject }));

const { currentProject } = await import("./project");
const db = {} as Db;

afterEach(() => {
    vi.unstubAllEnvs();
});

describe("currentProject", () => {
    it("uses QUARD_PROJECT_ID when it is set", async () => {
        expect(await currentProject(db, { QUARD_PROJECT_ID: " p1 " })).toEqual({ id: "p1", name: "Picked" });
    });

    it("falls back to the install's first project, reading the environment by default", async () => {
        vi.stubEnv("QUARD_PROJECT_ID", "");

        expect(await currentProject(db)).toEqual({ id: "first", name: "First" });
    });
});
