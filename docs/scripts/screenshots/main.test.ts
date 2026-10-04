// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { main, OUT_DIR } from "./main";

const mocks = vi.hoisted(() => ({
    kill: vi.fn(),
    close: vi.fn(),
    launch: vi.fn(),
    connect: vi.fn(),
    shoot: vi.fn(),
    mkdir: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({ mkdir: mocks.mkdir, writeFile: vi.fn() }));
vi.mock("./chrome.ts", () => ({ CHROME_PATH: "/default/chrome", launchChrome: mocks.launch, sleep: vi.fn() }));
vi.mock("./cdp.ts", () => ({ connect: mocks.connect }));
vi.mock("./shoot.ts", () => ({ shoot: mocks.shoot }));

beforeEach(() => {
    mocks.launch.mockResolvedValue({ wsUrl: "ws://page", kill: mocks.kill });
    mocks.connect.mockResolvedValue({ send: vi.fn(), close: mocks.close });
    mocks.shoot.mockResolvedValue([]);
    vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
});

describe("main", () => {
    it("takes every screenshot from the default dashboard", async () => {
        expect(await main([])).toBe(0);
        expect(mocks.mkdir).toHaveBeenCalledWith(OUT_DIR, { recursive: true });
        expect(mocks.launch).toHaveBeenCalledWith("/default/chrome", 9334);
        expect(mocks.shoot.mock.calls.length).toBeGreaterThan(20);
        expect(mocks.shoot.mock.calls[0]?.[2]).toMatchObject({ base: "http://localhost:3100", outDir: OUT_DIR });
        expect(mocks.close).toHaveBeenCalled();
        expect(mocks.kill).toHaveBeenCalled();
    });

    it("takes only the named screenshots, from the given dashboard and Chrome", async () => {
        vi.stubEnv("CHROME_PATH", "/env/chrome");
        mocks.shoot.mockResolvedValueOnce(["mark not found: 1 h1"]);
        expect(await main(["--url", "http://localhost:3100", "--only", "shell,run"])).toBe(1);
        expect(mocks.launch).toHaveBeenCalledWith("/env/chrome", 9334);
        expect(mocks.shoot.mock.calls.map((call) => call[1].name)).toEqual(["shell", "run"]);
        expect(console.log).toHaveBeenCalledWith("shell: mark not found: 1 h1");
        expect(console.log).toHaveBeenCalledWith("run");
    });

    it("refuses names it does not know", async () => {
        await expect(main(["--only", "shell,nope"])).rejects.toThrow("Unknown screenshot: nope");
        expect(mocks.launch).not.toHaveBeenCalled();
    });

    it("stops Chrome even when a screenshot fails", async () => {
        mocks.shoot.mockRejectedValueOnce(new Error("page crashed"));
        await expect(main(["--only", "shell"])).rejects.toThrow("page crashed");
        expect(mocks.kill).toHaveBeenCalled();
    });
});
