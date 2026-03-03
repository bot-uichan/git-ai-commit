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

インストール後:

```bash
git-ai-commit --regenerate
```

---

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

```bash
COMMIT_LANG=ja git-ai-commit
```

---

## Output example

```text
:robot: Generating commit message with Codex...

  feat(auth): add JWT refresh token support

Commit with this message? (y/n):
```

`--regenerate` を付けると確認時に `r` で再生成できます。

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
