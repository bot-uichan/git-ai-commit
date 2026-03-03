#!/usr/bin/env node
import { Codex } from "@openai/codex-sdk";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

type Lang = "ja" | "en";

type CliOptions = {
  regenerate: boolean;
  model?: string;
  prompt?: string;
  promptFile?: string;
};

function runGit(args: string[]) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) {
    const stderr = result.stderr?.trim() || "Unknown git error.";
    throw new Error(stderr);
  }
  return result.stdout;
}

function getStagedDiff() {
  return runGit(["diff", "--staged", "--no-color"]);
}

function sanitizeMessage(raw: string) {
  const firstLine = raw
    .trim()
    .split(/\r?\n/)
    .find((line) => line.trim().length > 0) ?? "";

  return firstLine.replace(/^['"`]+|['"`]+$/g, "").trim();
}

function buildPrompt(diff: string, lang: Lang, customPrompt?: string) {
  if (customPrompt?.trim()) {
    return customPrompt
      .replaceAll("{{LANG}}", lang)
      .replaceAll("{{DIFF}}", diff);
  }

  const langInstruction =
    lang === "ja"
      ? "コミットメッセージは日本語で作成してください。"
      : "Write the commit message in English.";

  return [
    "あなたはGitコミットメッセージ生成の専門家です。",
    langInstruction,
    "以下の条件を厳守してください:",
    "- git diff --staged の内容から意図を要約する",
    "- Conventional Commits 形式で1行のみ返す（feat:, fix:, chore:, refactor:, docs:, test:, ci: など）",
    "- 余計な説明、引用符、コードブロック、接頭辞は出力しない",
    "- 返答はコミットメッセージ本文のみ",
    "",
    "### git diff --staged",
    diff,
  ].join("\n");
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { regenerate: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--regenerate") {
      options.regenerate = true;
      continue;
    }

    if (arg === "--model") {
      const model = argv[i + 1];
      if (!model || model.startsWith("-")) {
        throw new Error("--model requires a value.");
      }
      options.model = model;
      i += 1;
      continue;
    }

    if (arg.startsWith("--model=")) {
      const model = arg.split("=", 2)[1]?.trim();
      if (!model) {
        throw new Error("--model requires a value.");
      }
      options.model = model;
      continue;
    }

    if (arg === "--prompt") {
      const prompt = argv[i + 1];
      if (!prompt || prompt.startsWith("-")) {
        throw new Error("--prompt requires a value.");
      }
      options.prompt = prompt;
      i += 1;
      continue;
    }

    if (arg.startsWith("--prompt=")) {
      const prompt = arg.split("=", 2)[1]?.trim();
      if (!prompt) {
        throw new Error("--prompt requires a value.");
      }
      options.prompt = prompt;
      continue;
    }

    if (arg === "--prompt-file") {
      const promptFile = argv[i + 1];
      if (!promptFile || promptFile.startsWith("-")) {
        throw new Error("--prompt-file requires a value.");
      }
      options.promptFile = promptFile;
      i += 1;
      continue;
    }

    if (arg.startsWith("--prompt-file=")) {
      const promptFile = arg.split("=", 2)[1]?.trim();
      if (!promptFile) {
        throw new Error("--prompt-file requires a value.");
      }
      options.promptFile = promptFile;
      continue;
    }

    if (arg === "-h" || arg === "--help") {
      console.log([
        "git-ai-commit",
        "",
        "Usage:",
        "  git-ai-commit [--regenerate] [--model <name>]",
        "",
        "Options:",
        "  --regenerate      Enable 'r' to regenerate message at confirmation prompt.",
        "  --model <name>        Codex model override (e.g. gpt-5, gpt-5-mini).",
        "  --prompt <text>       Custom full prompt template.",
        "  --prompt-file <path>  Load custom prompt template from file.",
        "",
        "Prompt template placeholders:",
        "  {{LANG}}   -> en | ja",
        "  {{DIFF}}   -> git diff --staged output",
        "",
        "Env:",
        "  COMMIT_LANG          en|ja (default: en)",
        "  COMMIT_MODEL         default model if --model is not provided",
        "                       fallback default: gpt-5.1-codex-mini",
        "  COMMIT_PROMPT        custom prompt template text",
        "  COMMIT_PROMPT_FILE   path to custom prompt template file", 
      ].join("\n"));
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (options.prompt && options.promptFile) {
    throw new Error("Use either --prompt or --prompt-file, not both.");
  }

  return options;
}

async function generateMessage(
  diff: string,
  lang: Lang,
  model?: string,
  customPrompt?: string,
): Promise<string> {
  const codex = new Codex();
  const thread = codex.startThread(model ? { model } : undefined);
  const turn = await thread.run(buildPrompt(diff, lang, customPrompt));
  const message = sanitizeMessage(turn.finalResponse ?? "");

  if (!message) {
    throw new Error("Codex returned an empty message.");
  }

  return message;
}

async function main() {
  let cliOptions: CliOptions;
  try {
    cliOptions = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error("❌ Invalid arguments:");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const lang = ((process.env.COMMIT_LANG || "en").toLowerCase() === "ja" ? "ja" : "en") as Lang;
  const model = cliOptions.model ?? process.env.COMMIT_MODEL ?? "gpt-5.1-codex-mini";
  const promptFile = cliOptions.promptFile ?? process.env.COMMIT_PROMPT_FILE;

  let customPrompt = cliOptions.prompt ?? process.env.COMMIT_PROMPT;
  if (!customPrompt && promptFile) {
    try {
      customPrompt = readFileSync(promptFile, "utf8");
    } catch (error) {
      console.error("❌ Failed to read prompt file:");
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  let diff: string;
  try {
    diff = getStagedDiff();
  } catch (error) {
    console.error("❌ Failed to read staged diff:");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  if (!diff.trim()) {
    console.error("❌ No staged changes found. Stage files first (git add ...) and try again.");
    process.exit(1);
  }

  const rl = createInterface({ input, output });

  try {
    while (true) {
      console.log("🤖 Generating commit message with Codex...\n");
      const message = await generateMessage(diff, lang, model, customPrompt);
      console.log(`  ${message}\n`);

      const prompt = cliOptions.regenerate
        ? "Commit with this message? (y/n/r): "
        : "Commit with this message? (y/n): ";

      const answer = (await rl.question(prompt)).trim().toLowerCase();

      if (answer === "y") {
        runGit(["commit", "-m", message]);
        console.log("✅ Committed.");
        break;
      }

      if (cliOptions.regenerate && answer === "r") {
        continue;
      }

      if (answer === "n") {
        console.log("⏹️ Commit canceled. Staging area was kept as-is.");
        break;
      }

      console.log("Please answer y or n" + (cliOptions.regenerate ? " or r." : "."));
    }
  } catch (error) {
    console.error("❌ Failed:");
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    rl.close();
  }
}

void main();
