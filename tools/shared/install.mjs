import { spawnSync } from "node:child_process";
import { constants } from "node:fs";
import { access, cp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

function homeDirectory() {
  return process.env.USERPROFILE ?? process.env.HOME ?? homedir();
}

export async function pathExists(fullPath) {
  try {
    await access(fullPath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function ensureParentDir(fullPath) {
  await mkdir(dirname(fullPath), { recursive: true });
}

export async function readJson(fullPath) {
  const raw = await readFile(fullPath, "utf8");
  return JSON.parse(raw.replace(/^\uFEFF/, ""));
}

export async function writeJson(fullPath, value) {
  await ensureParentDir(fullPath);
  await writeFile(fullPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function copyDirectory(sourceDir, targetDir) {
  await cp(sourceDir, targetDir, { recursive: true, force: true, errorOnExist: false });
}

export async function ensureJunction(linkPath, targetPath) {
  if (await pathExists(linkPath)) {
    await rm(linkPath, { recursive: true, force: true });
  }

  await mkdir(dirname(linkPath), { recursive: true });
  await symlink(targetPath, linkPath, "junction");
}

export function runCommand(command, args, options = {}) {
  if (process.platform === "win32" && /\.(cmd|bat)$/i.test(command)) {
    return spawnSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", command, ...args], {
      encoding: "utf8",
      windowsHide: true,
      ...options,
    });
  }

  return spawnSync(command, args, {
    encoding: "utf8",
    windowsHide: true,
    ...options,
  });
}

function commandError(result) {
  return result.error instanceof Error ? result.error.message : null;
}

export async function installSuperpowers(options = {}) {
  const homeDir = options.homeDir ?? homeDirectory();
  const repoUrl = options.repoUrl ?? "https://github.com/obra/superpowers.git";
  const sourceDir = options.sourceDir ?? process.env.HARNESS_KIT_SUPERPOWERS_SOURCE_DIR;
  const cloneDir = options.cloneDir ?? join(homeDir, ".codex", "superpowers");
  const skillsLink = options.skillsLink ?? join(homeDir, ".agents", "skills", "superpowers");

  let source = "present";
  if (sourceDir) {
    await copyDirectory(sourceDir, cloneDir);
    source = "copied";
  } else if (!(await pathExists(cloneDir))) {
    const result = runCommand("git", ["clone", repoUrl, cloneDir]);
    if (result.status !== 0) {
      throw new Error(`git clone superpowers failed: ${result.stderr || result.stdout || commandError(result) || "unknown error"}`);
    }
    source = "cloned";
  }

  const skillsDir = join(cloneDir, "skills");
  if (!(await pathExists(skillsDir))) {
    throw new Error(`superpowers skills directory is missing at ${skillsDir}`);
  }

  await ensureJunction(skillsLink, skillsDir);

  return {
    status: "installed",
    source,
    cloneDir,
    skillsLink,
    repoUrl,
  };
}

export async function installOhMyCodex(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const command = options.command ?? "omx";
  const scope = options.scope ?? "project";
  const verbose = options.verbose ?? false;

  const args = ["setup", "--scope", scope, "--force"];
  if (verbose) {
    args.push("--verbose");
  }

  const result = runCommand(command, args, { cwd });
  if (result.status !== 0) {
    throw new Error(`omx setup failed: ${result.stderr || result.stdout || commandError(result) || "unknown error"}`);
  }

  return {
    status: "installed",
    command,
    scope,
  };
}

export async function ensureMethodSources(options = {}) {
  const superpowers = await installSuperpowers(options);
  const ohMyCodex = await installOhMyCodex(options);
  return { superpowers, ohMyCodex };
}

export async function readInstallManifest(hostRoot) {
  const manifestPath = join(hostRoot, "harness", "install-manifest.json");
  if (!(await pathExists(manifestPath))) {
    return null;
  }

  return readJson(manifestPath);
}

export async function writeInstallManifest(hostRoot, value) {
  await writeJson(join(hostRoot, "harness", "install-manifest.json"), value);
}
