# renovate-runner

boykush 個人アカウントの**対象リポジトリを横断**して [Renovate](https://docs.renovatebot.com/) を実行する、セルフホスト型のランナーです。GitHub Actions 上でスケジュール実行し、GitHub App の権限で各リポジトリの依存更新 PR を自動作成します。

> managed by boykush/github-management

## 仕組み

`config.js` がセルフホスト用のグローバル設定で、`.github/workflows/renovate.yml` が4時間ごとにそれを回す。**なぜその設定なのかは、どちらもファイル自身のコメントが持つ**——autodiscover の範囲、Renovate に manager の無い `apm.yml` を拾う `customManagers`、bump と同じ commit で lock と生成物を追従させる `postUpgradeTasks`、automerge を同じ run の中で閉じる2 pass の理由まで。

- 各リポジトリ固有の設定は、そのリポジトリ内の `renovate.json` で行う。`config.js` に置くのは、**`renovate.json` を持たないリポジトリにも効かせる必要があるもの**だけ。
- `.claude/skills/renovate-sweep/` は、Renovate PR を横断で棚卸し・マージし、automerge 拡大まで検討する Claude Code skill（ローカルの `gh` 権限で実行）。

## 認証

GitHub App を2つ使う。横断実行を担う **Renovate App** と、その PR に approve を付けるだけの **承認用 App**。App 本体・権限・払い出しは [github-management](https://github.com/boykush/github-management)（台帳）と [infrastructure-as-code](https://github.com/boykush/infrastructure-as-code)（鍵と role）が持つ。

**この repo が持つのは App の名前だけ**（`renovate` / `pr-approver`）。識別子・KMS の alias・IAM role はすべて [boykush/workflows](https://github.com/boykush/workflows) の `github-app-token` action がその名前から引くので、Variables も Secrets も要らない。秘密鍵は KMS から出ず、run が受け取るのは JWT への署名1回分。

トークンに載せる権限と、それぞれが要る理由は `renovate.yml` のコメントが持つ。

## 実行

- **スケジュール**: 4 時間ごと（`cron: '0 */4 * * *'`）。頻度の変更は `.github/workflows/renovate.yml` の cron を編集。
- **手動**: Actions タブ → *Renovate* → **Run workflow**
  - `logLevel`: `info`（既定）/ `debug`
  - `dryRun`: チェックすると PR やブランチを作成せず、何が更新されるかだけログ出力

## 初回のおすすめ

最初は手動実行で `dryRun` を ON にし、ログで対象リポジトリと更新内容を確認してから、スケジュール実行に任せると安全です。
