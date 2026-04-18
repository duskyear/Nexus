import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

export interface LocalSkillMetadata {
  key: string;
  name: string;
  description: string;
  source: "project" | "bundled";
  path: string;
}

interface SkillFrontmatter {
  name?: string;
  description?: string;
}

function parseFrontmatter(raw: string): SkillFrontmatter {
  const normalized = raw.replace(/^\uFEFF/, "");
  const match = normalized.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    return {};
  }

  const result: SkillFrontmatter = {};
  for (const line of match[1].split(/\r?\n/)) {
    const frontmatterMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.+)$/);
    if (!frontmatterMatch) {
      continue;
    }

    const [, key, value] = frontmatterMatch;
    const cleaned = value.trim().replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
    if (key === "name") {
      result.name = cleaned;
    } else if (key === "description") {
      result.description = cleaned;
    }
  }

  return result;
}

async function collectSkillCatalogFromDir(
  skillDir: string,
  source: "project" | "bundled",
): Promise<LocalSkillMetadata[]> {
  try {
    const entries = await readdir(skillDir, { withFileTypes: true });
    const catalog = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const skillPath = join(skillDir, entry.name, "SKILL.md");
          try {
            const raw = await readFile(skillPath, "utf8");
            const frontmatter = parseFrontmatter(raw);
            return {
              key: entry.name,
              name: frontmatter.name ?? entry.name,
              description: frontmatter.description ?? "",
              source,
              path: skillPath,
            } satisfies LocalSkillMetadata;
          } catch {
            return null;
          }
        }),
    );

    return catalog.filter((item): item is LocalSkillMetadata => item !== null);
  } catch {
    return [];
  }
}

export async function collectLocalSkillCatalog(
  workspaceSkillDir: string,
  bundledSkillDir: string,
): Promise<LocalSkillMetadata[]> {
  const [projectSkills, bundledSkills] = await Promise.all([
    collectSkillCatalogFromDir(workspaceSkillDir, "project"),
    collectSkillCatalogFromDir(bundledSkillDir, "bundled"),
  ]);

  const merged = new Map<string, LocalSkillMetadata>();
  for (const skill of [...bundledSkills, ...projectSkills]) {
    merged.set(skill.key, skill);
  }

  return [...merged.values()].sort((left, right) => left.key.localeCompare(right.key));
}

export function localSkillNamesFromCatalog(catalog: LocalSkillMetadata[]): Set<string> {
  return new Set(catalog.map((skill) => skill.key));
}
