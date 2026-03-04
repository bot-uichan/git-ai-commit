#!/usr/bin/env node
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { xai } from "@ai-sdk/xai";
import { generateText } from "ai";
import { Codex } from "@openai/codex-sdk";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

type Lang = "ja" | "en";
type InferenceBackend = "codex" | "ai-sdk";
type AiSdkProvider = "openai" | "anthropic" | "google" | "xai";

type CliOptions = {
  regenerate: boolean;
  verbose: boolean;
  backend?: InferenceBackend;
  provider?: AiSdkProvider;
  model?: string;
  prompt?: string;
  promptFile?: string;
  commitArgs: string[];
  maxDiffChars?: number;
};

function runGit(args: string[]) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) {
    const stderr = result.stderr?.trim() || "Unknown git error.";
    throw new Error(stderr);
  }
  return result.stdout;
}

function ensureGitWorkTree() {
  const result = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { encoding: "utf8" });
  return result.status === 0 && result.stdout.trim() === "true";
}

function getStagedDiff() {
  if (!ensureGitWorkTree()) {
    throw new Error("Not a git repository. Move into a repository first.");
  }

  return runGit(["diff", "--cached", "--no-color"]);
}

function limitDiff(diff: string, maxChars: number) {
  if (diff.length <= maxChars) {
    return { diff, truncated: false, omittedChars: 0 };
  }

  const markerFor = (omittedChars: number) => `\n\n... [TRUNCATED ${omittedChars} chars] ...\n\n`;

  // Find a stable marker length (digits can change with omittedChars).
  let omittedGuess = Math.max(1, diff.length - maxChars);
  let marker = markerFor(omittedGuess);
  let available = Math.max(0, maxChars - marker.length);
  let nextOmitted = Math.max(1, diff.length - available);
  while (nextOmitted !== omittedGuess) {
    omittedGuess = nextOmitted;
    marker = markerFor(omittedGuess);
    available = Math.max(0, maxChars - marker.length);
    nextOmitted = Math.max(1, diff.length - available);
  }

  const headSize = Math.floor(available * 0.6);
  const tailSize = Math.max(0, available - headSize);
  const head = diff.slice(0, headSize);
  const tail = diff.slice(diff.length - tailSize);
  const omittedChars = Math.max(1, diff.length - (head.length + tail.length));
  const finalMarker = markerFor(omittedChars);
  const limited = `${head}${finalMarker}${tail}`;

  // Hard guarantee: final payload never exceeds limit.
  return {
    diff: limited.length <= maxChars ? limited : limited.slice(0, maxChars),
    truncated: true,
    omittedChars,
  };
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
  const options: CliOptions = { regenerate: false, verbose: false, commitArgs: [] };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--") {
      options.commitArgs = argv.slice(i + 1);
      break;
    }

    if (arg === "--max-diff-chars") {
      const value = argv[i + 1];
      const parsed = Number(value);
      if (!value || Number.isNaN(parsed) || parsed <= 0) {
        throw new Error("--max-diff-chars requires a positive number.");
      }
      options.maxDiffChars = parsed;
      i += 1;
      continue;
    }

    if (arg.startsWith("--max-diff-chars=")) {
      const rawValue = arg.split("=", 2)[1]?.trim();
      const parsed = Number(rawValue);
      if (!rawValue || Number.isNaN(parsed) || parsed <= 0) {
        throw new Error("--max-diff-chars requires a positive number.");
      }
      options.maxDiffChars = parsed;
      continue;
    }

    if (arg === "--regenerate") {
      options.regenerate = true;
      continue;
    }

    if (arg === "--verbose") {
      options.verbose = true;
      continue;
    }

    if (arg === "--backend") {
      const backend = argv[i + 1];
      if (backend !== "codex" && backend !== "ai-sdk") {
        throw new Error("--backend must be either 'codex' or 'ai-sdk'.");
      }
      options.backend = backend;
      i += 1;
      continue;
    }

    if (arg.startsWith("--backend=")) {
      const backend = arg.split("=", 2)[1]?.trim();
      if (backend !== "codex" && backend !== "ai-sdk") {
        throw new Error("--backend must be either 'codex' or 'ai-sdk'.");
      }
      options.backend = backend;
      continue;
    }

    if (arg === "--provider") {
      const provider = argv[i + 1];
      if (provider !== "openai" && provider !== "anthropic" && provider !== "google" && provider !== "xai") {
        throw new Error("--provider must be one of: openai, anthropic, google, xai.");
      }
      options.provider = provider;
      i += 1;
      continue;
    }

    if (arg.startsWith("--provider=")) {
      const provider = arg.split("=", 2)[1]?.trim();
      if (provider !== "openai" && provider !== "anthropic" && provider !== "google" && provider !== "xai") {
        throw new Error("--provider must be one of: openai, anthropic, google, xai.");
      }
      options.provider = provider;
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
        "  git-ai-commit [--regenerate] [--verbose] [--backend <codex|ai-sdk>] [--provider <openai|anthropic|google|xai>] [--model <name>] [--prompt <text>|--prompt-file <path>] [-- <git commit args...>]",
        "",
        "Options:",
        "  --regenerate            Enable 'r' to regenerate message at confirmation prompt.",
        "  --verbose               Print resolved runtime settings.",
        "  --backend <name>        Inference backend: codex | ai-sdk.",
        "  --provider <name>       ai-sdk provider: openai | anthropic | google | xai.",
        "  --model <name>          Model override.",
        "  --prompt <text>         Custom full prompt template.",
        "  --prompt-file <path>    Load custom prompt template from file.",
        "  --max-diff-chars <n>    Trim very large staged diffs before model call.",
        "  --                      Pass following args through to git commit.",
        "",
        "Prompt template placeholders:",
        "  {{LANG}}   -> en | ja",
        "  {{DIFF}}   -> git diff --staged output",
        "",
        "Env:",
        "  COMMIT_LANG            en|ja (default: en)",
        "  COMMIT_BACKEND         codex|ai-sdk (default: codex)",
        "  COMMIT_PROVIDER        openai|anthropic|google|xai (default: openai for ai-sdk)",
        "  COMMIT_MODEL           default model if --model is not provided",
        "                         defaults: codex=gpt-5.1-codex-mini, ai-sdk/openai=gpt-4o-mini",
        "                         note: ai-sdk provider != openai requires --model or COMMIT_MODEL",
        "  COMMIT_PROMPT          custom prompt template text",
        "  COMMIT_PROMPT_FILE     path to custom prompt template file",
        "  COMMIT_MAX_DIFF_CHARS  max diff characters before truncation (default: 50000)",
        "  CODEX_BIN              absolute path to codex binary (optional override)",
        "  OPENAI_API_KEY / ANTHROPIC_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY / XAI_API_KEY", 
      ].join("\n"));
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (options.prompt && options.promptFile) {
    throw new Error("Use either --prompt or --prompt-file, not both.");
  }

  const hasForbiddenMessageArg = options.commitArgs.some((arg) => {
    if (arg === "-m" || arg === "--message" || arg === "-F" || arg === "--file") {
      return true;
    }

    // Also block compact/equals forms, e.g. -mfoo, --message=foo, -Fmsg.txt, --file=msg.txt
    if (arg.startsWith("-m") && arg.length > 2) {
      return true;
    }
    if (arg.startsWith("-F") && arg.length > 2) {
      return true;
    }
    if (arg.startsWith("--message=") || arg.startsWith("--file=")) {
      return true;
    }

    return false;
  });

  if (hasForbiddenMessageArg) {
    throw new Error("Do not pass -m/--message/-F/--file after '--' (message is generated by git-ai-commit).");
  }

  return options;
}

function resolveCodexPath(): string | undefined {
  if (process.env.CODEX_BIN?.trim()) {
    return process.env.CODEX_BIN.trim();
  }

  const finder = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(finder, ["codex"], { encoding: "utf8" });
  if (result.status !== 0) {
    return undefined;
  }

  const firstPath = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  return firstPath;
}

function parseBackend(value?: string): InferenceBackend | undefined {
  if (!value) {
    return undefined;
  }

  if (value === "codex" || value === "ai-sdk") {
    return value;
  }

  throw new Error("COMMIT_BACKEND must be 'codex' or 'ai-sdk'.");
}

function parseProvider(value?: string): AiSdkProvider | undefined {
  if (!value) {
    return undefined;
  }

  if (value === "openai" || value === "anthropic" || value === "google" || value === "xai") {
    return value;
  }

  throw new Error("COMMIT_PROVIDER must be one of: openai, anthropic, google, xai.");
}

function requiredApiKeyForProvider(provider: AiSdkProvider): string {
  switch (provider) {
    case "openai":
      return "OPENAI_API_KEY";
    case "anthropic":
      return "ANTHROPIC_API_KEY";
    case "google":
      return "GOOGLE_GENERATIVE_AI_API_KEY";
    case "xai":
      return "XAI_API_KEY";
    default:
      throw new Error(`Unsupported ai-sdk provider: ${provider}`);
  }
}

async function generateMessageWithCodex(
  diff: string,
  lang: Lang,
  model?: string,
  customPrompt?: string,
  codexPath?: string,
): Promise<string> {
  const codex = new Codex(codexPath ? { codexPathOverride: codexPath } : undefined);
  const thread = codex.startThread(model ? { model } : undefined);
  const turn = await thread.run(buildPrompt(diff, lang, customPrompt));
  const message = sanitizeMessage(turn.finalResponse ?? "");

  if (!message) {
    throw new Error("Codex returned an empty message.");
  }

  return message;
}

function aiSdkModel(provider: AiSdkProvider, model: string) {
  switch (provider) {
    case "openai":
      return openai(model);
    case "anthropic":
      return anthropic(model);
    case "google":
      return google(model);
    case "xai":
      return xai(model);
    default:
      throw new Error(`Unsupported ai-sdk provider: ${provider}`);
  }
}

async function generateMessageWithAiSdk(
  diff: string,
  lang: Lang,
  provider: AiSdkProvider,
  model: string,
  customPrompt?: string,
): Promise<string> {
  const prompt = buildPrompt(diff, lang, customPrompt);
  const result = await generateText({
    model: aiSdkModel(provider, model),
    prompt,
  });

  const message = sanitizeMessage(result.text ?? "");
  if (!message) {
    throw new Error("ai-sdk provider returned an empty message.");
  }

  return message;
}

async function generateMessage(params: {
  backend: InferenceBackend;
  diff: string;
  lang: Lang;
  model: string;
  customPrompt?: string;
  codexPath?: string;
  provider: AiSdkProvider;
}): Promise<string> {
  if (params.backend === "ai-sdk") {
    return generateMessageWithAiSdk(
      params.diff,
      params.lang,
      params.provider,
      params.model,
      params.customPrompt,
    );
  }

  return generateMessageWithCodex(
    params.diff,
    params.lang,
    params.model,
    params.customPrompt,
    params.codexPath,
  );
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

  let backend: InferenceBackend;
  let provider: AiSdkProvider;
  try {
    backend = cliOptions.backend ?? parseBackend(process.env.COMMIT_BACKEND) ?? "codex";
    provider = cliOptions.provider ?? parseProvider(process.env.COMMIT_PROVIDER) ?? "openai";
  } catch (error) {
    console.error("❌ Invalid backend/provider configuration:");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const modelFromInput = cliOptions.model ?? process.env.COMMIT_MODEL;

  if (backend === "codex" && (cliOptions.provider || process.env.COMMIT_PROVIDER)) {
    console.warn("⚠️ Provider is ignored when backend=codex.");
  }

  if (backend === "ai-sdk") {
    const requiredKey = requiredApiKeyForProvider(provider);
    if (!process.env[requiredKey]?.trim()) {
      console.error(`❌ Missing API key for ai-sdk provider '${provider}': set ${requiredKey}.`);
      process.exit(1);
    }
  }

  const model = (() => {
    if (modelFromInput) {
      return modelFromInput;
    }

    if (backend === "codex") {
      return "gpt-5.1-codex-mini";
    }

    if (provider === "openai") {
      return "gpt-4o-mini";
    }

    console.error(`❌ Model is required for ai-sdk provider '${provider}'. Use --model or COMMIT_MODEL.`);
    process.exit(1);
  })();

  const codexPath = backend === "codex" ? resolveCodexPath() : undefined;

  const envPrompt = process.env.COMMIT_PROMPT;
  const envPromptFile = process.env.COMMIT_PROMPT_FILE;

  if (envPrompt && envPromptFile) {
    console.warn("⚠️ Both COMMIT_PROMPT and COMMIT_PROMPT_FILE are set. COMMIT_PROMPT is preferred.");
  }

  if (cliOptions.prompt && (cliOptions.promptFile || envPromptFile)) {
    console.warn("⚠️ --prompt is set, so prompt file settings are ignored.");
  }

  if (cliOptions.promptFile && envPrompt) {
    console.warn("⚠️ --prompt-file is set, so COMMIT_PROMPT is ignored.");
  }

  const envMaxDiffCharsRaw = process.env.COMMIT_MAX_DIFF_CHARS;
  const envMaxDiffChars = envMaxDiffCharsRaw ? Number(envMaxDiffCharsRaw) : undefined;
  if (envMaxDiffCharsRaw && (!envMaxDiffChars || Number.isNaN(envMaxDiffChars) || envMaxDiffChars <= 0)) {
    console.error("❌ COMMIT_MAX_DIFF_CHARS must be a positive number.");
    process.exit(1);
  }
  const maxDiffChars = cliOptions.maxDiffChars ?? envMaxDiffChars ?? 50000;

  let promptSource = "default";
  let customPrompt: string | undefined;

  if (cliOptions.prompt) {
    customPrompt = cliOptions.prompt;
    promptSource = "--prompt";
  } else if (cliOptions.promptFile) {
    try {
      customPrompt = readFileSync(cliOptions.promptFile, "utf8");
      promptSource = "--prompt-file";
    } catch (error) {
      console.error("❌ Failed to read prompt file:");
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  } else if (envPrompt) {
    customPrompt = envPrompt;
    promptSource = "COMMIT_PROMPT";
  } else if (envPromptFile) {
    try {
      customPrompt = readFileSync(envPromptFile, "utf8");
      promptSource = "COMMIT_PROMPT_FILE";
    } catch (error) {
      console.error("❌ Failed to read prompt file:");
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  if (cliOptions.verbose) {
    console.log(`ℹ️ backend=${backend}`);
    console.log(`ℹ️ provider=${provider}`);
    console.log(`ℹ️ model=${model}`);
    console.log(`ℹ️ lang=${lang}`);
    console.log(`ℹ️ promptSource=${promptSource}`);
    console.log(`ℹ️ codexPath=${codexPath ?? "(not used)"}`);
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

  const limited = limitDiff(diff, maxDiffChars);
  if (limited.truncated) {
    console.warn(`⚠️ Large diff detected. Truncated ${limited.omittedChars} chars before sending to model.`);
  }
  diff = limited.diff;

  const rl = createInterface({ input, output });

  try {
    while (true) {
      const backendLabel = backend === "codex" ? "Codex" : `ai-sdk (${provider})`;
      console.log(`🤖 Generating commit message with ${backendLabel}...\n`);
      const message = await generateMessage({
        backend,
        provider,
        diff,
        lang,
        model,
        customPrompt,
        codexPath,
      });
      console.log(`  ${message}\n`);

      const prompt = cliOptions.regenerate
        ? "Commit with this message? (y/n/r): "
        : "Commit with this message? (y/n): ";

      const answer = (await rl.question(prompt)).trim().toLowerCase();

      if (answer === "y") {
        runGit(["commit", "-m", message, ...cliOptions.commitArgs]);
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
