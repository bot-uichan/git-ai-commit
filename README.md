# git-ai-commit

ステージ済み差分（`git diff --staged`）を AI で要約し、
Conventional Commits 形式の1行メッセージを提案してからコミットするCLIです。

- `codex` バックエンド（`@openai/codex-sdk` / `codex login`）
- `ai-sdk` バックエンド（OpenAI / Anthropic / Google / xAI のAPIキー）

---

## 1. Quick Start

### 必要条件
- `codex` バックエンドを使う場合:
  - `codex login` 済み
  - `codex` コマンドが使えること（`@openai/codex`）
- `ai-sdk` バックエンドを使う場合:
  - 利用するプロバイダのAPIキー環境変数（後述）

### 推奨インストール（Bun）

```bash
bun add -g github:bot-uichan/git-ai-commit
```

npm版:

```bash
npm i -g github:bot-uichan/git-ai-commit
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

### バックエンド指定（codex / ai-sdk）

```bash
# default: codex
git-ai-commit --backend codex

# ai-sdk backend
git-ai-commit --backend ai-sdk --provider openai --model gpt-4o-mini
```

- `COMMIT_BACKEND=codex|ai-sdk`
- `COMMIT_PROVIDER=openai|anthropic|google|xai`（ai-sdk時）
- `backend=codex` のとき `provider` は無視され、warning が表示されます

### モデル指定

```bash
# codex backend
git-ai-commit --backend codex --model gpt-5.1-codex-mini

# ai-sdk backend
git-ai-commit --backend ai-sdk --provider anthropic --model claude-3-5-sonnet-latest
```

- デフォルト:
  - codex: `gpt-5.1-codex-mini`
  - ai-sdk/openai: `gpt-4o-mini`
- `ai-sdk` で provider が `openai` 以外の場合、`--model`（または `COMMIT_MODEL`）必須
- 優先順位: `--model` > `COMMIT_MODEL`

### 言語指定

```bash
COMMIT_LANG=ja git-ai-commit
```

- `COMMIT_LANG=en|ja`（デフォルト: `en`）

### Codex バイナリ位置を明示（codexバックエンドのトラブル時）

```bash
CODEX_BIN="$(which codex)" git-ai-commit --backend codex --verbose
```

### ai-sdk 利用時の API キー環境変数

- OpenAI: `OPENAI_API_KEY`
- Anthropic: `ANTHROPIC_API_KEY`
- Google: `GOOGLE_GENERATIVE_AI_API_KEY`
- xAI: `XAI_API_KEY`

`backend=ai-sdk` 実行時、providerに対応するキーが未設定なら実行前にエラーで止まります。

例:

```bash
COMMIT_BACKEND=ai-sdk COMMIT_PROVIDER=openai OPENAI_API_KEY=... git-ai-commit
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

### Nix（Codex同梱ラッパーで実行）

```bash
nix run 'github:bot-uichan/git-ai-commit?ref=main'
```

固定バージョン:

```bash
nix run 'github:bot-uichan/git-ai-commit?ref=v0.1.6'
```

> zsh は `?` を展開するので、URLはクォートしてください。

---

## 6. 開発

```bash
git clone https://github.com/bot-uichan/git-ai-commit.git
cd git-ai-commit
bun install
bun run check
bun run build
bunx tsx src/cli.ts
```

---

## 7. リリース

タグ `v*` push で GitHub Actions がリリースを作成します。

```bash
git tag v0.1.6
git push origin v0.1.6
```
