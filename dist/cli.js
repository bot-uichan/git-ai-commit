#!/usr/bin/env node
import { Codex } from "@openai/codex-sdk";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
function runGit(args) {
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
function limitDiff(diff, maxChars) {
    if (diff.length <= maxChars) {
        return { diff, truncated: false, omittedChars: 0 };
    }
    const headSize = Math.max(1, Math.floor(maxChars * 0.6));
    const tailSize = Math.max(1, maxChars - headSize);
    const head = diff.slice(0, headSize);
    const tail = diff.slice(-tailSize);
    const omittedChars = diff.length - (head.length + tail.length);
    return {
        diff: `${head}\n\n... [TRUNCATED ${omittedChars} chars] ...\n\n${tail}`,
        truncated: true,
        omittedChars,
    };
}
function sanitizeMessage(raw) {
    const firstLine = raw
        .trim()
        .split(/\r?\n/)
        .find((line) => line.trim().length > 0) ?? "";
    return firstLine.replace(/^['"`]+|['"`]+$/g, "").trim();
}
function buildPrompt(diff, lang, customPrompt) {
    if (customPrompt?.trim()) {
        return customPrompt
            .replaceAll("{{LANG}}", lang)
            .replaceAll("{{DIFF}}", diff);
    }
    const langInstruction = lang === "ja"
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
function parseArgs(argv) {
    const options = { regenerate: false, verbose: false, commitArgs: [] };
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
                "  git-ai-commit [--regenerate] [--verbose] [--model <name>] [--prompt <text>|--prompt-file <path>] [-- <git commit args...>]",
                "",
                "Options:",
                "  --regenerate      Enable 'r' to regenerate message at confirmation prompt.",
                "  --verbose         Print resolved runtime settings.",
                "  --model <name>        Codex model override (e.g. gpt-5, gpt-5-mini).",
                "  --prompt <text>       Custom full prompt template.",
                "  --prompt-file <path>      Load custom prompt template from file.",
                "  --max-diff-chars <n>      Trim very large staged diffs before Codex call.",
                "  --                    Pass following args through to git commit.",
                "",
                "Prompt template placeholders:",
                "  {{LANG}}   -> en | ja",
                "  {{DIFF}}   -> git diff --staged output",
                "",
                "Env:",
                "  COMMIT_LANG          en|ja (default: en)",
                "  COMMIT_MODEL         default model if --model is not provided",
                "                       fallback default: gpt-5.1-codex-mini",
                "  COMMIT_PROMPT          custom prompt template text",
                "  COMMIT_PROMPT_FILE     path to custom prompt template file",
                "  COMMIT_MAX_DIFF_CHARS  max diff characters before truncation (default: 50000)",
            ].join("\n"));
            process.exit(0);
        }
        throw new Error(`Unknown argument: ${arg}`);
    }
    if (options.prompt && options.promptFile) {
        throw new Error("Use either --prompt or --prompt-file, not both.");
    }
    const forbiddenMessageFlags = new Set(["-m", "--message", "-F", "--file"]);
    if (options.commitArgs.some((arg) => forbiddenMessageFlags.has(arg))) {
        throw new Error("Do not pass -m/--message/-F/--file after '--' (message is generated by git-ai-commit).");
    }
    return options;
}
async function generateMessage(diff, lang, model, customPrompt) {
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
    let cliOptions;
    try {
        cliOptions = parseArgs(process.argv.slice(2));
    }
    catch (error) {
        console.error("❌ Invalid arguments:");
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
    const lang = ((process.env.COMMIT_LANG || "en").toLowerCase() === "ja" ? "ja" : "en");
    const model = cliOptions.model ?? process.env.COMMIT_MODEL ?? "gpt-5.1-codex-mini";
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
    let customPrompt;
    if (cliOptions.prompt) {
        customPrompt = cliOptions.prompt;
        promptSource = "--prompt";
    }
    else if (cliOptions.promptFile) {
        try {
            customPrompt = readFileSync(cliOptions.promptFile, "utf8");
            promptSource = "--prompt-file";
        }
        catch (error) {
            console.error("❌ Failed to read prompt file:");
            console.error(error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    }
    else if (envPrompt) {
        customPrompt = envPrompt;
        promptSource = "COMMIT_PROMPT";
    }
    else if (envPromptFile) {
        try {
            customPrompt = readFileSync(envPromptFile, "utf8");
            promptSource = "COMMIT_PROMPT_FILE";
        }
        catch (error) {
            console.error("❌ Failed to read prompt file:");
            console.error(error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    }
    if (cliOptions.verbose) {
        console.log(`ℹ️ model=${model}`);
        console.log(`ℹ️ lang=${lang}`);
        console.log(`ℹ️ promptSource=${promptSource}`);
    }
    let diff;
    try {
        diff = getStagedDiff();
    }
    catch (error) {
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
        console.warn(`⚠️ Large diff detected. Truncated ${limited.omittedChars} chars before sending to Codex.`);
    }
    diff = limited.diff;
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
    }
    catch (error) {
        console.error("❌ Failed:");
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    }
    finally {
        rl.close();
    }
}
void main();
