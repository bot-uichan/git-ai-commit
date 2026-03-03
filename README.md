# git-ai-commit

ステージ済み差分（`git diff --staged`）を Codex で要約し、
Conventional Commits 形式の1行メッセージを提案してからコミットするCLIです。

---

## 1. Quick Start

### 必要条件
- `codex login` 済み
- `codex` コマンドが使えること（`@openai/codex`）

### 推奨インストール（npm / Bun）

```bash
npm i -g github:bot-uichan/git-ai-commit
# or
bun add -g github:bot-uichan/git-ai-commit
```

実行:

```bash
git-ai-commit --regenerate
```

---

## 2. 基本の使い方

```bash
git-ai-commit
```

- `y` でコミット
- `n` でキャンセル（ステージは維持）
- `--regenerate` 付きなら `r` で再生成

```bash
git-ai-commit --regenerate
```

### `git commit` オプションを渡す

`--` 以降は `git commit` にそのまま渡せます。

```bash
git-ai-commit -- --amend --no-verify
```

> `-m/--message/-F/--file`（`--message=...`, `-mfoo` 含む）はこのCLI側で管理するため禁止です。

---

## 3. 主要オプション

### モデル指定

```bash
git-ai-commit --model gpt-5
# or
COMMIT_MODEL=gpt-5-mini git-ai-commit
```

- デフォルト: `gpt-5.1-codex-mini`
- 優先順位: `--model` > `COMMIT_MODEL`

### 言語指定

```bash
COMMIT_LANG=ja git-ai-commit
```

- `COMMIT_LANG=en|ja`（デフォルト: `en`）

### Codex バイナリ位置を明示（トラブル時）

```bash
CODEX_BIN="$(which codex)" git-ai-commit --verbose
```

### 大きいdiffの上限

```bash
git-ai-commit --max-diff-chars 80000
# or
COMMIT_MAX_DIFF_CHARS=80000 git-ai-commit
```

- デフォルト: `50000`

### プロンプト上書き

```bash
git-ai-commit --prompt 'Return one Conventional Commit line in {{LANG}}. Diff:\n{{DIFF}}'
# or
git-ai-commit --prompt-file .git-ai-commit-prompt.txt
```

プレースホルダー:
- `{{LANG}}`
- `{{DIFF}}`

優先順位:
1. `--prompt`
2. `--prompt-file`
3. `COMMIT_PROMPT`
4. `COMMIT_PROMPT_FILE`

設定確認:

```bash
git-ai-commit --verbose
```

---

## 4. Git alias（推奨）

`git commit` の上書きはせず、独自サブコマンドで使うのがおすすめです。

```bash
git config --global alias.aic '!git-ai-commit'
```

```bash
git aic
```

---

## 5. インストール方法（補足）

### Releaseバイナリ導入（実験的）

```bash
curl -fsSL https://raw.githubusercontent.com/bot-uichan/git-ai-commit/main/scripts/install.sh | bash
```

Windows:

```powershell
iwr https://raw.githubusercontent.com/bot-uichan/git-ai-commit/main/scripts/install.ps1 -UseBasicParsing | iex
```

> 注意: 環境によっては `codex` 解決が必要になるため、問題時は `CODEX_BIN` を併用してください。

### Nix

```bash
nix run github:bot-uichan/git-ai-commit
```

固定バージョン:

```bash
nix run github:bot-uichan/git-ai-commit?ref=v0.1.6
```

---

## 6. 開発

```bash
git clone https://github.com/bot-uichan/git-ai-commit.git
cd git-ai-commit
npm install
npm run check
npm run build
npx tsx src/cli.ts
```

---

## 7. リリース

タグ `v*` push で GitHub Actions がリリースを作成します。

```bash
git tag v0.1.6
git push origin v0.1.6
```
