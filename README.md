# git-ai-commit

`git diff --staged` を Codex CLI SDK（`@openai/codex-sdk`）で解析し、
Conventional Commits 形式の1行メッセージを提案してからコミットするCLIです。

## Requirements

- Node.js 20+（または Bun）
- `codex login` 済み

---

## Global install（おすすめ）

### npm（GitHub repo から直接）

```bash
npm i -g github:bot-uichan/git-ai-commit
```

### Bun

```bash
bun add -g github:bot-uichan/git-ai-commit
```

### Bunで単体バイナリを作る

```bash
bun install
bun run build:bun-bin
./bin/git-ai-commit --help
```

インストール後:

```bash
git-ai-commit --regenerate
```

---

## GitHub Release（自動ビルド）

`v*` タグをpushすると GitHub Actions が自動でバイナリを作成し、Release に添付します。

- `git-ai-commit-linux-x64`
- `git-ai-commit-darwin-arm64`
- 各 `.sha256`

リリース作成例:

```bash
git tag v0.1.2
git push origin v0.1.2
```

## Nix flake package

`flake.nix` の outputs に `packages.<system>.git-ai-commit` を追加済みです。

```bash
# build
nix build .#git-ai-commit

# run
./result/bin/git-ai-commit --help
```

## Local development

```bash
git clone https://github.com/bot-uichan/git-ai-commit.git
cd git-ai-commit
npm install
npm run check
npm run build
```

開発実行:

```bash
npx tsx src/cli.ts
```

---

## Language switch

環境変数 `COMMIT_LANG` で切り替えます。

- `COMMIT_LANG=en` (default)
- `COMMIT_LANG=ja`

一時指定（そのコマンド実行時のみ）:

```bash
COMMIT_LANG=ja git-ai-commit
```

永続設定（シェルごと）:

### bash

```bash
echo 'export COMMIT_LANG=ja' >> ~/.bashrc
echo 'export COMMIT_MODEL=gpt-5-mini' >> ~/.bashrc
source ~/.bashrc
```

### zsh

```bash
echo 'export COMMIT_LANG=ja' >> ~/.zshrc
echo 'export COMMIT_MODEL=gpt-5-mini' >> ~/.zshrc
source ~/.zshrc
```

### fish

```fish
set -Ux COMMIT_LANG ja
set -Ux COMMIT_MODEL gpt-5-mini
```

---

## Output example

```text
:robot: Generating commit message with Codex...

  feat(auth): add JWT refresh token support

Commit with this message? (y/n):
```

`--regenerate` を付けると確認時に `r` で再生成できます。

```bash
git-ai-commit --regenerate
```

`git commit` のオプションを透過で渡したいときは `--` 以降に指定します。

```bash
git-ai-commit -- --amend --no-verify
```

> `-m/--message/-F/--file` はこのCLI側で管理するため、`--` の後ろには渡せません。

---

## Model selection

Codexモデルは `--model` または環境変数 `COMMIT_MODEL` で指定できます。
デフォルトは `gpt-5.1-codex-mini` です。

```bash
git-ai-commit --model gpt-5
# or
COMMIT_MODEL=gpt-5-mini git-ai-commit
```

`--model` が優先されます。

---

## Prompt customization

プロンプトは次の方法で上書きできます。

- `--prompt "..."`（直接指定）
- `--prompt-file ./prompt.txt`（ファイル指定）
- `COMMIT_PROMPT`（環境変数）
- `COMMIT_PROMPT_FILE`（環境変数）

プレースホルダー:

- `{{LANG}}` → `en` / `ja`
- `{{DIFF}}` → `git diff --staged` の出力

例:

```bash
git-ai-commit --prompt 'You are commit expert. Return one Conventional Commit line in {{LANG}} only. Diff:\n{{DIFF}}'
```

```bash
git-ai-commit --prompt-file .git-ai-commit-prompt.txt
```

`--prompt` / `--prompt-file` が環境変数より優先されます。

---

## Git subcommand として使う（`git commit` は上書きしない）

`git commit` の上書きは事故りやすいので、独自サブコマンドを推奨します。

```bash
git config --global alias.aic '!git-ai-commit'
```

これで:

```bash
git aic
```

で実行できます。

---

## `prepare-commit-msg` hook（代替案）

このCLIは対話型（確認プロンプトあり）なので、hook運用には非対話モード追加が理想です。
現状は `git aic` / `git-ai-commit` の手動実行を推奨します。
