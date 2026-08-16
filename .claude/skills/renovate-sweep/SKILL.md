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
  --json number,title,author,mergeable,mergeStateStatus,statusCheckRollup,url \
  --jq '.[] | select(.author.login=="app/boykush-renovate-app")'
```

`url` も取っておいてください。最後の報告でマージできなかった PR にリンクを貼るのに使います。

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

緑にならない PR、あるいは **CI が「赤い」のではなく「走っていない」** PR に当たったら [known-issues.md](known-issues.md) を読んでください。過去に踏んだ原因と検出・対処コマンドをまとめてあります。

いずれも PR ページを見るだけでは分かりません。特に `gh pr checks` に `renovate/stability-days` しか出ない repo は、CI が無いのではなく run が駐車している可能性が高いです。

## 5. automerge の検討（このスキルの完了条件）

一巡した後、**手でマージしたものの中に automerge へ回せる更新が無いか**を必ず検討します。検討だけで終わらせず、変更があれば PR を出すところまでがこのスキルの完了条件です。無ければ「無し」と明示して終わります。

判断材料は [automerge.md](automerge.md) にあります。置き場所の決め方（横断は `config.js`、エコシステム固有は各 repo の renovate.json）、広げる前に満たすべき条件、debug 実行での効果確認までまとめてあります。

ひとつだけ手順側にも書いておきます。`automerge: true` と `addLabels: ["automerge"]` は**必ず対**です。ラベルが無いと承認 App が拾わず、automerge が永久に待ち続けます。

PR を出す repo の言語に合わせてください。config の `description`・commit message・PR 本文の全てが対象です。owner 配下で統一されていません（scraps は英語、dotfiles は日本語）。既存の PR 本文を1件読んでから書き始めるのが確実です。

# 報告

最後に以下を報告します。

- マージした PR（repo ごと）
- **マージできなかった PR を、1件ずつリンク付きで**。理由（実作業が必要 / rebase 待ち / stability-days 待ち / scope 不足）を添えて、repo ごとにまとめます
- 詰まりの原因として見つかった構造的な問題があれば、対症療法と恒久対応を分けて
- automerge 検討の結論と、出した PR

**残した PR は必ずリンクにします。** 続きを手で触るのはこのリストからで、`#12` のような番号だけでは repo をまたいだ時に辿れません。手順1で取った `url` をそのまま使ってください。件数が多くても省略や「他N件」で畳まないこと。マージした側は件数が多くなりがちなので、番号の羅列で構いません。
