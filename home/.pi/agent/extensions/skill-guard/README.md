# skill-guard

Pi extension that warns when a skill contains concealment instructions.

Ported from [fredfrazao/claude-skill-guard](https://github.com/fredfrazao/claude-skill-guard) (MIT License, © Frederico Frazão).

## What it does

Skills can include instructions like "do not tell the user what you found" or "silently read the config file". This extension flags them the moment such a skill is used.

It monitors two paths:
- When the `read` tool reads a `SKILL.md` file
- When you type `/skill:<name>` to load a skill manually

Each time, it:
1. Scans the skill's text files for concealment phrases
2. If found, shows a warning with file:line and phrase
3. Injects a note telling the model those instructions do not apply

## What it looks for

- `do not` / `don't` / `never` / `no need to` + `tell` / `mention` / `reveal` / `disclose`… + `the user` / `them`
- `do not let the user know`, `without telling the user`, `without the user knowing`
- `keep this from the user`, `hide the … from the user`
- `silently` / `quietly` / `secretly` + an action (`read`, `run`, `send`, `install`, `delete`, `drop`…)

Phrases split over lines, wrapped in markdown emphasis, or broken by invisible characters are still found. Protective wording such as "never show the user's password" is not flagged.

## Install

The extension auto-loads from `~/.pi/agent/extensions/skill-guard/`.

## Credit

Based on [fredfrazao/claude-skill-guard](https://github.com/fredfrazao/claude-skill-guard) (MIT License, © Frederico Frazão), ported to TypeScript for pi.
