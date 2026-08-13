# automerge を広げる

SKILL.md の手順 5 から参照されます。automerge に回せる候補が見つかったとき、どこに何を書くかの判断材料です。

## 仕組み

packageRule が `automerge: true` と `addLabels: ["automerge"]` を付ける → `approve-bot-prs.yml` が `automerge` ラベルの付いた Renovate PR を承認 App（`boykush-pr-approver`）で approve → Renovate 自身が `PUT /pulls/{n}/merge` でマージ、という流れです。

**`automerge` と `addLabels` は必ず対で書きます。** public repo は承認1件必須で、Renovate は自分の PR を承認できません。ラベルが無いと承認 App が対象を絞れず拾わないため、automerge が永久に待ち続けます。

`allow_auto_merge`（GitHub 側の auto-merge）は使いません。有効にするとマージボックスが待機表示に置き換わり、bypass コントロールが UI から消えるためです（github-management の CLAUDE.md 参照）。Renovate 自前の automerge はブランチ全体の status を待つので、required check だけを見る platform automerge より厳しい gate になります。

## 置き場所の決め方

`config.js` のヘッダが「per-repository settings は各リポジトリの renovate.json へ」と宣言しています。それに従って機械的に振り分けてください。

| 対象 | 置き場所 | 理由 |
| --- | --- | --- |
| 全 repo 横断 | `config.js` | GitHub Actions は 1 リリースが全 repo に波及する。既存の `actions/**` ルールがこれ |
| 特定 repo / エコシステム固有 | その repo の renovate.json | cargo を全体に書いても Rust repo 以外では死に設定になる。dotfiles が mise ルールを自前の renovate.json に置いているのが前例 |

repo 側 config は置き場所が揺れます。先に実在を確認してください。

```sh
for p in renovate.json .github/renovate.json .renovaterc .renovaterc.json; do
  gh api "repos/boykush/<repo>/contents/$p" --jq '.path' 2>/dev/null
done
```

実績: scraps は `.github/renovate.json`、dotfiles は root の `renovate.json`。

## 広げる前に満たすべき条件

1. **その repo の required check が、PR で走る CI を実質的に覆っていること。** required check が無い repo に automerge を付けると無検査でマージされます。ruleset を確認してください。

   ```sh
   gh api repos/boykush/<repo>/rulesets --jq '.[].id' | while read -r id; do
     gh api repos/boykush/<repo>/rulesets/$id \
       --jq '.rules[]? | select(.type=="required_status_checks")
             | .parameters.required_status_checks[].context'
   done
   ```

2. **known-issues.md の「auto-commit で check が付かない」問題を抱えていないこと。** 抱えたまま広げると、ラベルだけ付いて永久に止まる PR が増えます。dotfiles が実際にこの状態でした。

3. **major を含めないこと。** 実績として major は壊れます（tera v2 は `Tera::new()` のシグネチャ変更、skunk 0.6.5 は shapeless から twiddles への移行）。`matchUpdateTypes` は `minor` / `patch` / `digest` / `pinDigest` に限定します。

## 書き方

`config.js` に足す場合は、既存の packageRules と同じく description を付けます。third-party action は `**` で広げず 1 つずつ名前で足す方針です（既存コメント参照）。

repo 側に足す場合の最小形です。

```json
{
  "description": "<なぜこれを automerge に回すか。gate が何かを書く>",
  "matchManagers": ["cargo"],
  "matchUpdateTypes": ["minor", "patch"],
  "automerge": true,
  "addLabels": ["automerge"]
}
```

## 効果の確認

Renovate を手動実行し、debug ログで判定を見ます。**INFO レベルでは automerge の判定が一切出ません。**

```sh
gh workflow run renovate.yml --repo boykush/renovate-runner -f logLevel=debug
```

該当 branch に対して以下が出ているかを確認します。

- `PR is configured for automerge` / `PR is not configured for automerge` — ルールが効いているか
- `Branch status green` — status 待ちを抜けたか
- `PR automerged` — 実際にマージされたか

ルールの効き方だけ先に見たいときは `-f dryRun=true` を併用します。branch も PR も作らずに判定だけログに出ます。
