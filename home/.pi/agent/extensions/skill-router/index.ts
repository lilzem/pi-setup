import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as path from "node:path";
import * as os from "node:os";
import {
  loadRoutesFromFile,
  isSkillInstalled,
  matchSkills,
} from "./router.ts";

const HOME = os.homedir();
const ROUTES_PATH = path.join(
  HOME,
  ".pi",
  "agent",
  "extensions",
  "skill-router",
  "skill-routes.json",
);

const SKILL_DIRS = [
  path.join(HOME, ".claude", "skills"),
  path.join(HOME, ".agents", "skills"),
];

export default function (pi: ExtensionAPI) {
  const routes = loadRoutesFromFile(ROUTES_PATH);
  const suggestedInSession = new Set<string>();

  pi.on("session_start", () => {
    suggestedInSession.clear();
  });

  pi.on("before_agent_start", (event) => {
    if (event.messageType !== "user" || !event.prompt) return {};

    const matched = matchSkills(event.prompt, routes);
    const toSuggest = matched.filter(
      (skill) => !suggestedInSession.has(skill) && isSkillInstalled(skill, SKILL_DIRS),
    );

    if (toSuggest.length === 0) return {};

    toSuggest.forEach((skill) => suggestedInSession.add(skill));

    const hints = toSuggest
      .map(
        (skill) =>
          `Skill \`${skill}\` likely fits this request — read its SKILL.md before acting.`,
      )
      .join("\n");

    return {
      systemPrompt: `${event.systemPrompt}\n\n${hints}`,
    };
  });
}
