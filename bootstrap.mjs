#!/usr/bin/env node
import { access, copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ensureMethodSources, writeInstallManifest } from "./tools/shared/install.mjs";

const BUNDLE_FILES = [
  ".gitignore",
  "AGENTS.md",
  "harness/AGENT_DESIGN_CARD.md",
  "harness/HARNESS_WORKFLOW.md",
  "harness/integrations.md",
  "harness/integration-checklist.md",
  "harness/POCKET_GUIDE.md",
  "harness/PROMPT_TEMPLATES.md",
  "harness/REVIEW_GATE_CHECKLIST.md",
  "harness/guard.config.json",
  "README.md"
];

const BUNDLE_DIRS = [
  "tools/control-plane",
  "tools/guard",
  "tools/orchestrator",
  "tools/shared",
  "tools/templates",
];

function isHumanOwned(path) {
  return path === ".gitignore" || path === "AGENTS.md" || (path.startsWith("harness/") && path.endsWith(".md"));
}

function readFlag(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1) {
    return undefined;
  }

  return args[index + 1];
}

async function pathExists(fullPath) {
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

async function readJson(fullPath) {
  const raw = await readFile(fullPath, "utf8");
  return JSON.parse(raw.replace(/^\uFEFF/, ""));
}

async function writeJson(fullPath, value) {
  await ensureParentDir(fullPath);
  await writeFile(fullPath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function mergeScripts(pkg) {
  pkg.scripts ??= {};
  pkg.scripts.guard ??= "node --import tsx ./tools/guard/cli/index.ts";
  pkg.scripts.doctor ??= "node --import tsx ./tools/guard/cli/index.ts doctor";
  pkg.scripts.template ??= "node --import tsx ./tools/templates/cli/index.ts";
  pkg.scripts.orchestrator ??= "node --import tsx ./tools/orchestrator/cli/index.ts";
  pkg.scripts.test ??= "vitest run";
}


async function copyDirectory(sourceDir, targetDir) {
  await mkdir(targetDir, { recursive: true });
  const entries = await readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = join(sourceDir, entry.name);
    const targetPath = join(targetDir, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, targetPath);
      continue;
    }
    await ensureParentDir(targetPath);
    await copyFile(sourcePath, targetPath);
  }
}

async function copyDirectoryIfSafe(sourceDir, targetDir, relPath, conflicts) {
  const entries = await readdir(sourceDir, { withFileTypes: true });
  if (!(await pathExists(targetDir))) {
    await copyDirectory(sourceDir, targetDir);
    return;
  }

  for (const entry of entries) {
    const sourcePath = join(sourceDir, entry.name);
    const targetPath = join(targetDir, entry.name);
    const childRelPath = relPath ? `${relPath}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      await copyDirectoryIfSafe(sourcePath, targetPath, childRelPath, conflicts);
      continue;
    }
    await copyFileIfSafe(sourcePath, targetPath, childRelPath, conflicts);
  }
}


async function copyFileIfSafe(sourcePath, targetPath, relPath, conflicts) {
  if (!(await pathExists(targetPath))) {
    const content = await readFile(sourcePath, "utf8");
    await ensureParentDir(targetPath);
    await writeFile(targetPath, content, "utf8");
    return;
  }

  const sourceContent = await readFile(sourcePath, "utf8");
  const targetContent = await readFile(targetPath, "utf8");
  if (sourceContent === targetContent) return;

  // Preserve human-owned files and create backups for smooth upgrading instead of failing
  if (isHumanOwned(relPath)) {
    const backupPath = `${targetPath}.bak`;
    await copyFile(targetPath, backupPath);
    await writeFile(targetPath, sourceContent, "utf8");
    conflicts.push(`${relPath} (Conflict detected. Overwritten with new version. Previous version backed up to ${relPath}.bak)`);
    return;
  }
  
  // For non human-owned, we just overwrite because it's a tool/framework file update
  await writeFile(targetPath, sourceContent, "utf8");
}

async function main() {
  const bundleDir = dirname(fileURLToPath(import.meta.url));
  const hostRoot = process.cwd();
  const conflicts = [];
  const args = process.argv.slice(2);
  const withMethodSources = args.includes("--with-method-sources");


  const offlineNodeModules = join(bundleDir, "node_modules");
  if (await pathExists(offlineNodeModules)) {
    await copyDirectory(offlineNodeModules, join(hostRoot, "node_modules"));
  }

  await copyDirectoryIfSafe(join(bundleDir, "skills"), join(hostRoot, "skills"), "skills", conflicts);

  for (const relDir of BUNDLE_DIRS) {
    await copyDirectoryIfSafe(
      join(bundleDir, ...relDir.split("/")),
      join(hostRoot, ...relDir.split("/")),
      relDir,
      conflicts,
    );
  }

  for (const relPath of BUNDLE_FILES) {
    const sourcePath = join(bundleDir, ...relPath.split("/"));
    const targetPath = join(hostRoot, ...relPath.split("/"));
    await copyFileIfSafe(sourcePath, targetPath, relPath, conflicts);
  }

  const packagePath = join(hostRoot, "package.json");
  const pkg = (await pathExists(packagePath))
    ? await readJson(packagePath)
    : { name: basename(hostRoot) || "workspace", private: true, scripts: {} };
  mergeScripts(pkg);
  await writeJson(packagePath, pkg);

  let methodSources = {
    requested: false,
    superpowers: { status: "skipped" },
    oh_my_codex: { status: "skipped" },
  };

  if (withMethodSources) {
    try {
      const installed = await ensureMethodSources({
        cwd: hostRoot,
        sourceDir: readFlag(args, "--superpowers-source-dir") ?? process.env.HARNESS_KIT_SUPERPOWERS_SOURCE_DIR,
        repoUrl: process.env.HARNESS_KIT_SUPERPOWERS_REPO_URL,
        command: readFlag(args, "--omx-command") ?? process.env.HARNESS_KIT_OMX_COMMAND,
        verbose: args.includes("--verbose"),
      });
      methodSources = {
        requested: true,
        superpowers: {
          status: installed.superpowers.status,
          source: installed.superpowers.source,
          clone_dir: installed.superpowers.cloneDir,
          skills_link: installed.superpowers.skillsLink,
        },
        oh_my_codex: {
          status: installed.ohMyCodex.status,
          command: installed.ohMyCodex.command,
          scope: installed.ohMyCodex.scope,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`harness-kit method source install failed: ${message}\n`);
      methodSources = {
        requested: true,
        superpowers: {
          status: "failed",
          error: message,
        },
        oh_my_codex: {
          status: "failed",
          error: message,
        },
      };
      conflicts.push("method-sources");
    }
  }

  await writeJson(join(hostRoot, "harness.version.json"), {
    template_name: "default",
    install_mode: "full",
    template_version: "0.1.0",
    cli_version: "0.1.0",
    installed_at: new Date().toISOString(),
  });

  await writeInstallManifest(hostRoot, {
    template_name: "default",
    install_mode: withMethodSources ? "full" : "harness-only",
    template_version: "0.1.0",
    cli_version: "0.1.0",
    installed_at: new Date().toISOString(),
    method_sources: methodSources,
  });

  if (conflicts.length > 0) {
    process.stderr.write("harness-kit bootstrap detected file modifications:\n" + conflicts.map((c) => "- " + c).join("\n") + "\nPlease merge your custom modifications from the backup files if necessary.\n");
  }
}

void main();
