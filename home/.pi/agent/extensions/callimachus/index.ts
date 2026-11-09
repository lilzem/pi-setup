import { getMarkdownTheme, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Box, Markdown } from "@earendil-works/pi-tui";
import { spawn, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { guideSection, guideTopics } from "./guide.ts";
import { syncSessions } from "./sync.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const home = os.homedir();
const PI_SESSIONS = path.join(home, ".pi/agent/sessions");
const CODEX_HOME = path.join(home, ".local/share/callimachus-pi");
const INDEX_DB = path.join(home, "Library/Application Support/dev.shaller.callimachus/index.db");
const CAL = path.join(home, ".local/bin/cal");
const readGuide = () => fs.readFileSync(path.join(here, "GUIDE.md"), "utf8");

function pointIndexAtMirror() {
  fs.mkdirSync(CODEX_HOME, { recursive: true });
  if (!fs.existsSync(INDEX_DB)) return;
  spawnSync("sqlite3", [INDEX_DB, `INSERT OR REPLACE INTO app_config(key,value) VALUES('paths.codex_home','${CODEX_HOME}')`]);
}

function mirror() {
  pointIndexAtMirror();
  return syncSessions(PI_SESSIONS, CODEX_HOME);
}

export default function (pi: ExtensionAPI) {
  if (!fs.existsSync(CAL)) return;

  pi.on("resources_discover", async () => ({ skillPaths: [path.join(here, "skills")] }));

  pi.registerEntryRenderer<{ markdown: string }>("cal-help", (entry) => {
    const box = new Box(1, 1);
    box.addChild(new Markdown(entry.data?.markdown ?? "", 0, 0, getMarkdownTheme()));
    return box;
  });

  pi.registerCommand("cal-help", {
    description: "Show the Callimachus (cal) usage guide; optional topic",
    getArgumentCompletions: (prefix) => {
      const items = guideTopics(readGuide()).filter((t) => t.startsWith(prefix)).map((t) => ({ value: t, label: t }));
      return items.length > 0 ? items : null;
    },
    handler: async (args) => {
      pi.appendEntry("cal-help", { markdown: guideSection(readGuide(), args) });
    },
  });

  pi.registerCommand("cal-sync", {
    description: "Mirror pi sessions into Callimachus and reindex now",
    handler: async (_args, ctx) => {
      const { written } = mirror();
      ctx.ui.notify(`cal: mirrored ${written} changed pi session(s), reindexing…`, "info");
      const run = spawnSync(CAL, ["index"], { encoding: "utf8" });
      ctx.ui.notify(run.status === 0 ? `cal: ${run.stdout.trim().split("\n").pop()}` : `cal index failed: ${run.stderr.trim()}`, run.status === 0 ? "info" : "error");
    },
  });

  pi.on("session_shutdown", async () => {
    mirror();
    spawn(CAL, ["index", "--if-stale"], { detached: true, stdio: "ignore" }).unref();
  });
}
