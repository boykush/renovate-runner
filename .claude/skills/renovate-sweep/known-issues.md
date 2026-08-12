# 詰まっている Renovate PR の原因切り分け

SKILL.md の手順 4 から参照されます。過去に実際に踏んだものだけを、遭遇頻度の高い順に並べています。上から順に疑ってください。

いずれも PR ページを見るだけでは原因が分かりません。「CI が赤い」ではなく「CI が走っていない」ケースが多いことに注意してください。

## workflow run が `action_required` で駐車している

**症状**: `gh pr checks` に `renovate/stability-days` しか出ない。CI がある repo なのに check run が 1 つも無い。required check がある repo では、これで**誰にもマージできない**状態になります（required check ruleset の `current_user_can_bypass` は `never`）。

**原因**: PR branch へ auto-commit する workflow（dotfiles の `mise lock` など）が GITHUB_TOKEN で push すると、GitHub は無限ループ防止のため後続 workflow を起動しません。結果、最終 head SHA に check run が付きません。GitHub は run を作ったうえで `action_required` に駐車させることがあり、この場合も check run は publish されません。

**検出**:

```sh
sha=$(gh pr view <n> --repo boykush/<repo> --json headRefOid --jq .headRefOid)
gh api "repos/boykush/<repo>/actions/runs?head_sha=$sha" \
  --jq '.workflow_runs[] | select(.conclusion=="action_required") | "\(.id) \(.name)"'
```

**対処**: run id を承認すると走り出します。

```sh
gh api -X POST repos/boykush/<repo>/actions/runs/<run_id>/approve
```

**注意**: これは対症療法です。恒久対応は auto-commit の push を App token に変えること（CI App は既に ruleset の bypass actor で、TF 管理ファイルの commit にも使われています）。

**automerge を有効にしている repo でこれが起きると automerge ごと死にます**。ラベルは付くのに永久に待つ PR ができるので、見つけたら必ず報告してください。dotfiles で実際にこれが起きていました。

## mise.toml だけ上がって mise.lock が古い

**症状**: CI が `<tool>@<version> is not in the lockfile` で落ちる。

**原因**: Renovate は `mise.toml` の版だけを上げ、`mise.lock` は再生成しません。`mise lock` workflow を持たない repo（github-management など）では毎回これになります。

**対処**: branch を main に rebase してから relock し、force push します。platform 集合はその repo の CLAUDE.md に従ってください（github-management は 4 platform 固定）。

```sh
mise lock -p linux-x64,linux-arm64,macos-arm64,macos-x64
```

ローカルの mise が古いと `mise lock -p` 自体が使えません（`mise version X is required` と出ます）。ユーザーの mise を勝手に self-update せず、`~/.cache/mise/mise-<version>` に新しいバイナリがあればそれを直接呼んでください。

**恒久対応**: その repo に `mise lock` workflow を入れること。ただし上の `action_required` 問題を同時に踏むので、push は App token にする必要があります。

## CI が古すぎて再実行できない

**症状**: `gh api -X POST .../rerun` が `Unable to retry this workflow run because it was created over a month ago` を返す。古い PR の失敗 check が stale なまま残っている。

**対処**: 空コミットを push して再走させます。

```sh
git commit --allow-empty -m "Retrigger CI"
```

**注意**: Renovate の onboarding PR で close & reopen は使わないこと。閉じた時点で onboarding 拒否と解釈される可能性があります。

## repo 自身の workflow が SHA pin されていない

**症状**: その repo の**全 PR** が同じように落ちる。ログの先頭付近に出ます。

```
The actions actions/checkout@v3 and actions/setup-java@v5 are not allowed in
boykush/<repo> because all actions must be pinned to a full-length commit SHA.
```

**原因**: github-management の `sha_pinning.tf` が全 repo に SHA pin を強制しています。未 pin の workflow を持つ repo は、テストが走る前の action 解決段階で落ちます。main も同じ理由で赤いはずです。

**対処**: Renovate PR ではなく repo 側を直す PR を先に出します。テスト本体を疑うのはその後です。実例として atnos-eff-application-parts は10件全滅していましたが、workflow を直したらテストは通りました。

pin 先は Renovate が既に提案しているバージョンに合わせると、その PR が「解決済み」として自動 close され二度手間になりません。ランナーイメージの変化で別の失敗が出ることもあります（ubuntu-24.04 は sbt を同梱しなくなっており、`sbt/setup-sbt` の追加が必要でした）。

## 兄弟 PR の conflict

**症状**: 1件マージした直後、同じ lock file を触る他の PR が `CONFLICTING/DIRTY` になる。

**対処**: 触らず Renovate の次回実行に任せます。手で rebase する必要はありません。まとめてマージする時は 1 件ずつ結果を見ながら進めてください。
