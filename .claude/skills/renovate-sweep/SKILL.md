---
name: renovate-sweep
description: boykush 配下の Renovate PR を横断で棚卸しし、マージできるものをマージ、詰まっているものは原因を特定して解消する。最後に automerge を広げられる更新が無いか検討し、PR を出す
allowed-tools: Bash, Read, Edit, Write
---

boykush owner 配下の Renovate PR を一巡し、マージ・詰まり解消・automerge 拡大の検討までを行います。

ローカルの `gh` 認証で実行します。CI からではありません。

# 前提

- `gh auth status` に `repo` scope があること。
- `.github/workflows/**` を含む PR をマージするなら **`workflow` scope も必須**。無いと merge API が `refusing to allow an OAuth App to create or update workflow ... without workflow scope` を返します。足りなければ `gh auth refresh -s workflow` を促してください（こちらでは実行しない）。
- `apply` は CI の仕事です。ローカルで `terraform apply` はしません。

# 手順

## 1. 棚卸し

対象 repo は Renovate の autodiscover と同じ集合です。

```sh
gh api -X GET search/repositories --paginate \
  -f q='user:boykush fork:false archived:false' --jq '.items[].name'
```

各 repo の Renovate PR を集めます。**author の表記が API で 2 通りある**ので取り違えないこと。`gh pr list` は `app/boykush-renovate-app`、`gh search prs` は `boykush-renovate-app[bot]` を返します。

```sh
gh pr list --repo boykush/<repo> --state open --limit 50 \
  --json number,title,author,mergeable,mergeStateStatus,statusCheckRollup \
  --jq '.[] | select(.author.login=="app/boykush-renovate-app")'
```

## 2. 状態の読み方

- **`mergeStateStatus: BLOCKED` は異常ではありません**。public repo は `modules/ruleset` が承認レビュー1件を要求するため、緑でも必ず BLOCKED になります。private (Free) は ruleset が無いので CLEAN です。
- `mergeable: CONFLICTING` は触らず Renovate の rebase に任せます。1件マージすると同じ lock file を触る兄弟 PR が conflict するので、**まとめてマージする時は1件ずつ結果を見ながら**進めてください。
- `renovate/stability-days` は Renovate が付ける commit status で、`conclusion` が null です。CI の失敗ではありません。`pending` なら `minimumReleaseAge` 待ちなので放置します。

## 3. マージ

`gh pr merge` は pre-flight で弾かれるため使えません（bypass 権限を見ないため）。API を直接叩きます。

```sh
gh api -X PUT repos/boykush/<repo>/pulls/<n>/merge -f merge_method=merge
```

事前に bypass が効くか確認できます。

```sh
gh api repos/boykush/<repo>/rulesets --jq '.[].id' | while read -r id; do
  gh api repos/boykush/<repo>/rulesets/$id --jq '"\(.name) -> \(.current_user_can_bypass)"'
done
```

- `Require pull request` → `pull_requests_only`。承認をバイパスしてマージできます。
- `Required check: *` → `never`。**required check は自分にも効きます**。緑にする以外に道はありません。落ちている PR を通そうとしないこと。

## 4. 詰まっている PR の原因切り分け

過去に踏んだものです。上から順に疑ってください。

### workflow run が `action_required` で駐車している

PR branch へ auto-commit する workflow（`mise lock` など）が GITHUB_TOKEN で push すると、後続 run が起動しない or 承認待ちで止まり、**head SHA に check run が付きません**。required check が付いている repo ではこれで永久にマージ不能になります。`gh pr checks` に何も出ないのに CI があるはずの repo は、これを疑ってください。

```sh
sha=$(gh pr view <n> --repo boykush/<repo> --json headRefOid --jq .headRefOid)
gh api "repos/boykush/<repo>/actions/runs?head_sha=$sha" \
  --jq '.workflow_runs[] | select(.conclusion=="action_required") | .id'
```

出た run id を承認すると走ります。

```sh
gh api -X POST repos/boykush/<repo>/actions/runs/<run_id>/approve
```

これは対症療法です。恒久対応は auto-commit の push を App token にすること（CI App は既に ruleset の bypass actor）。**automerge を有効にしている repo でこれが起きると automerge ごと死にます**ので、見つけたら報告してください。

### mise.toml だけ上がって mise.lock が古い

CI が `<tool>@<version> is not in the lockfile` で落ちます。`mise lock` workflow を持たない repo（github-management など）で起きます。branch を main に rebase してから relock し、force push します。platform 集合は repo の CLAUDE.md に従ってください。

```sh
mise lock -p linux-x64,linux-arm64,macos-arm64,macos-x64
```

### CI が古すぎて再実行できない

1か月以上前の run は `gh api -X POST .../rerun` が `Unable to retry this workflow run because it was created over a month ago` を返します。空コミットを push して再走させます。

```sh
git commit --allow-empty -m "Retrigger CI"
```

Renovate の onboarding PR で close & reopen は使わないこと。閉じた瞬間に onboarding 拒否と解釈される可能性があります。

### repo 自身の workflow が SHA pin されていない

`github-management` の `sha_pinning.tf` が全 repo に SHA pin を強制しているため、未 pin の workflow を持つ repo は **action の解決段階で全 PR が落ちます**。テストが壊れているのではなく起動していないので、`sbt test` などの本体を疑う前にここを見てください。Renovate PR ではなく repo 側を直す PR を先に出します。直すと Renovate が「解決済み」として当該バージョンの PR を自動 close することがあります。

## 5. automerge の検討（このスキルの完了条件）

一巡した後、**手でマージしたものの中に automerge へ回せる更新が無いか**を必ず検討します。検討だけで終わらせず、変更があれば PR を出すところまでがこのスキルの完了条件です。無ければ「無し」と明示して終わります。

### 仕組み

`config.js` の packageRule が `automerge: true` と `addLabels: ["automerge"]` を付ける → `approve-bot-prs.yml` が `automerge` ラベルの付いた Renovate PR を承認 App で approve → Renovate 自身が `PUT /pulls/{n}/merge` でマージ、という流れです。

**`automerge` と `addLabels` は必ず対で書きます。** public repo は承認1件必須で Renovate は自分の PR を承認できません。ラベルが無いと承認 App が拾えず、automerge が永久に待ち続けます。

`allow_auto_merge`（GitHub 側の auto-merge）は使いません。有効にすると bypass コントロールが UI から消えるためです（github-management の CLAUDE.md 参照）。Renovate 自前の automerge はブランチ全体の status を待つので、こちらのほうが厳しい gate です。

### 置き場所の決め方

`config.js` のヘッダに「per-repository settings は各リポジトリの renovate.json へ」と書いてある通りに従います。

- **全 repo 横断のもの → `config.js`**。GitHub Actions の更新は 1 リリースが全 repo に波及するのでこちら。既存の `actions/**` ルールがこれです。
- **特定 repo / エコシステム固有のもの → その repo の `renovate.json`**。cargo を全体に書いても Rust repo 以外では死に設定になります。dotfiles が mise ルールを自前の `renovate.json` に置いているのが前例です。

repo 側の config は場所が揺れます。先に実在を確認してください（scraps は `.github/renovate.json`、dotfiles は root の `renovate.json`）。

### 広げる前に満たすべき条件

1. その repo の required check が、PR で走る CI を実質的に覆っていること。required check が無い repo に automerge を付けると無検査でマージされます。
2. 4 の「auto-commit で check が付かない」問題を抱えていないこと。抱えたまま広げるとラベルだけ付いて止まる PR が増えます。
3. major を含めないこと。実績として major は壊れます（tera v2、skunk 0.6.5 など）。`matchUpdateTypes` は `minor` / `patch` / `digest` / `pinDigest` に限定します。

### 効果の確認

Renovate を手動実行し、debug ログで判定を見ます。

```sh
gh workflow run renovate.yml --repo boykush/renovate-runner -f logLevel=debug
```

`PR automerged` / `PR is not configured for automerge` / `Branch status green` が該当 branch に対して出ているかを確認します。INFO レベルでは automerge の判定が一切出ないので、切り分けには debug が要ります。

ルールの効き方だけ先に見たいときは `-f dryRun=true` を併用します。branch も PR も作らずに判定だけログに出ます。

# 報告

最後に以下を報告します。

- マージした PR（repo ごと）
- 残した PR と、その理由（実作業が必要なもの / rebase 待ち / scope 不足）
- 詰まりの原因として見つかった構造的な問題があれば、対症療法と恒久対応を分けて
- automerge 検討の結論と、出した PR
