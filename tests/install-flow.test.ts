import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, delimiter } from "node:path";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, test } from "vitest";

import { runGuard } from "../tools/guard/cli/run.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map(async (root) => {
      await rm(root, { recursive: true, force: true });
    }),
  );
});

async function createTempDir(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

async function createFakeOmx(binDir: string): Promise<string> {
  await mkdir(binDir, { recursive: true });
  const omxPath = join(binDir, "omx.cmd");
  await writeFile(
    omxPath,
    [
      "@echo off",
      "if /I \"%~1\"==\"setup\" (",
      "  if not exist \".omx\" mkdir \".omx\"",
      "  > \".omx\\setup-scope.json\" echo {\"scope\":\"project\"}",
      "  > \".omx\\hud-config.json\" echo {}",
      "  exit /b 0",
      ")",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );
  return omxPath;
}

async function createSuperpowersSource(root: string): Promise<void> {
  await mkdir(join(root, "skills", "alpha"), { recursive: true });
  await writeFile(join(root, "skills", "alpha", "SKILL.md"), "# Alpha\n", "utf8");
}

function runBootstrap(cwd: string, env: NodeJS.ProcessEnv, args: string[] = []): void {
  const result = spawnSync(process.execPath, [join(process.cwd(), "bootstrap.mjs"), ...args], {
    cwd,
    env,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(`bootstrap failed: ${result.stderr || result.stdout || "unknown error"}`);
  }
}

describe("installation flow", () => {
  test("bootstrap can install harness files and method sources together", async () => {
    const project = await createTempDir("harness-bootstrap-project-");
    const home = await createTempDir("harness-bootstrap-home-");
    const sources = await createTempDir("harness-bootstrap-superpowers-");
    const bin = await createTempDir("harness-bootstrap-bin-");

    await createSuperpowersSource(sources);
    const omxCommand = await createFakeOmx(bin);

    const env = {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
      HARNESS_KIT_SUPERPOWERS_SOURCE_DIR: sources,
      HARNESS_KIT_OMX_COMMAND: omxCommand,
    };

    await writeFile(
      join(project, "package.json"),
      JSON.stringify({ name: "temp-project", private: true, scripts: { test: "vitest run" } }, null, 2),
      "utf8",
    );

    runBootstrap(project, env, ["--with-method-sources", "--superpowers-source-dir", sources, "--omx-command", omxCommand]);

    const manifest = JSON.parse(await readFile(join(project, "harness", "install-manifest.json"), "utf8"));
    expect(manifest.method_sources.requested).toBe(true);
    expect(manifest.method_sources.superpowers.status).toBe("installed");
    expect(manifest.method_sources.oh_my_codex.status).toBe("installed");
    expect(await readFile(join(project, "harness", "integrations.md"), "utf8")).toContain("Purpose");
    expect(await readFile(join(project, "harness", "integration-checklist.md"), "utf8")).toContain("Required Sources");
    expect(await readFile(join(project, "skills", "brainstorming", "SKILL.md"), "utf8")).toContain("#");
    expect(JSON.parse(await readFile(join(project, "package.json"), "utf8")).scripts.doctor).toBeDefined();
    expect(await readFile(join(home, ".codex", "superpowers", "skills", "alpha", "SKILL.md"), "utf8")).toContain("Alpha");
    expect(await readFile(join(project, ".omx", "setup-scope.json"), "utf8")).toContain("\"project\"");
  });

  test("doctor can fix missing external method sources", async () => {
    const project = await createTempDir("harness-doctor-project-");
    const home = await createTempDir("harness-doctor-home-");
    const sources = await createTempDir("harness-doctor-superpowers-");
    const bin = await createTempDir("harness-doctor-bin-");

    await createSuperpowersSource(sources);
    const omxCommand = await createFakeOmx(bin);

    const env = {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
      HARNESS_KIT_SUPERPOWERS_SOURCE_DIR: sources,
      HARNESS_KIT_OMX_COMMAND: omxCommand,
    };

    await writeFile(
      join(project, "package.json"),
      JSON.stringify({ name: "temp-project", private: true, scripts: { test: "vitest run" } }, null, 2),
      "utf8",
    );

    runBootstrap(project, env);

    const previousHome = process.env.HOME;
    const previousUserProfile = process.env.USERPROFILE;
    const previousPath = process.env.PATH;
    const previousSource = process.env.HARNESS_KIT_SUPERPOWERS_SOURCE_DIR;
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    process.env.PATH = env.PATH;
    process.env.HARNESS_KIT_SUPERPOWERS_SOURCE_DIR = sources;

    try {
      const result = await runGuard(
        [
          "doctor",
          "--fix",
          "--superpowers-source-dir",
          sources,
          "--omx-command",
          omxCommand,
        ],
        { cwd: project },
      );
      expect(result.status).toBe("PASS");
      expect((result as Record<string, unknown>).method_sources).toBeDefined();
      expect((result as Record<string, any>).method_sources.superpowers.status).toBe("installed");
      expect((result as Record<string, any>).method_sources.oh_my_codex.status).toBe("installed");
    } finally {
      process.env.HOME = previousHome;
      process.env.USERPROFILE = previousUserProfile;
      process.env.PATH = previousPath;
      process.env.HARNESS_KIT_SUPERPOWERS_SOURCE_DIR = previousSource;
    }

    expect(await readFile(join(home, ".codex", "superpowers", "skills", "alpha", "SKILL.md"), "utf8")).toContain("Alpha");
    expect(await readFile(join(project, ".omx", "setup-scope.json"), "utf8")).toContain("\"project\"");
  });
});
