import * as fs from "node:fs";
import * as path from "node:path";

export type SkillRoute = {
  skill: string;
  regexes: RegExp[];
};

function checkDirForSkill(dir: string, skillName: string): boolean {
  const skillPath = path.join(dir, skillName, "SKILL.md");
  if (fs.existsSync(skillPath)) return true;

  try {
    const syncedPath = path.join(dir, "synced");
    if (!fs.existsSync(syncedPath)) return false;

    const syncedDirs = fs.readdirSync(syncedPath);
    for (const subdir of syncedDirs) {
      const nestedSkillPath = path.join(
        syncedPath,
        subdir,
        skillName,
        "SKILL.md",
      );
      if (fs.existsSync(nestedSkillPath)) return true;
    }
  } catch {
    return false;
  }
  return false;
}

export function isSkillInstalled(skillName: string, dirs: string[]): boolean {
  for (const dir of dirs) {
    if (checkDirForSkill(dir, skillName)) return true;
  }
  return false;
}

export function loadRoutesFromFile(filePath: string): SkillRoute[] {
  try {
    const json = fs.readFileSync(filePath, "utf8");
    return loadRoutes(json);
  } catch {
    return [];
  }
}

function compilePatterns(patterns: unknown[]): RegExp[] {
  const regexes: RegExp[] = [];
  for (const pattern of patterns) {
    if (typeof pattern !== "string") continue;
    try {
      regexes.push(new RegExp(pattern, "i"));
    } catch {
      continue;
    }
  }
  return regexes;
}

function isValidRoute(item: unknown): item is { skill: string; patterns: unknown[] } {
  return (
    !!item &&
    typeof item === "object" &&
    "skill" in item &&
    typeof item.skill === "string" &&
    "patterns" in item &&
    Array.isArray(item.patterns)
  );
}

export function loadRoutes(json: string): SkillRoute[] {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];

    const routes: SkillRoute[] = [];
    for (const item of parsed) {
      if (!isValidRoute(item)) continue;

      const regexes = compilePatterns(item.patterns);
      if (regexes.length > 0) {
        routes.push({ skill: item.skill, regexes });
      }
    }
    return routes;
  } catch {
    return [];
  }
}

export function matchSkills(prompt: string, routes: SkillRoute[]): string[] {
  if (!prompt || prompt.startsWith("/")) return [];

  const matched = new Set<string>();
  for (const route of routes) {
    for (const regex of route.regexes) {
      if (regex.test(prompt)) {
        matched.add(route.skill);
        break;
      }
    }
  }
  return Array.from(matched);
}
