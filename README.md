# renovate-runner

boykush 個人アカウントの**対象リポジトリを横断**して [Renovate](https://docs.renovatebot.com/) を実行する、セルフホスト型のランナーです。GitHub Actions 上でスケジュール実行し、GitHub App の権限で各リポジトリの依存更新 PR を自動作成します。

> managed by boykush/github-management

## 仕組み

| ファイル | 役割 |
| --- | --- |
| `.github/workflows/renovate.yml` | 4 時間ごと（+ 手動）に Renovate を起動する GitHub Actions ワークフロー |
| `config.js` | セルフホスト用のグローバル設定（autodiscover / onboarding など）。**全リポジトリ共通**の挙動を定義 |
| `renovate.json` | この `renovate-runner` リポジトリ自身の依存設定（onboarding 済み扱い） |

- `autodiscover: true` + `autodiscoverFilter` により、GitHub App がインストールされた boykush 配下のリポジトリを自動的に対象にします（`archive-applications` と `scala-multi-project-base` は対象外）。
- 各リポジトリ固有の設定は、そのリポジトリ内の `renovate.json` で行います（このリポジトリの `config.js` はグローバル設定専用）。
- まだ Renovate 設定が無いリポジトリには onboarding PR が自動で作成されます。

## 認証

横断実行には GitHub App が必要で、ワークフローは以下の Variables / Secrets を参照します。App 本体・権限・払い出しは `boykush/github-management` で管理されます。

| 種別 | 名前 | 用途 |
| --- | --- | --- |
| Variable | `RENOVATE_APP_ID` | GitHub App の App ID（公開識別子） |
| Secret | `RENOVATE_APP_PRIVATE_KEY` | GitHub App の秘密鍵（`.pem` 全文） |

App に必要な権限: Contents / Pull requests / Issues / Workflows（いずれも Read and write）。

## 実行

- **スケジュール**: 4 時間ごと（`cron: '0 */4 * * *'`）。頻度の変更は `.github/workflows/renovate.yml` の cron を編集。
- **手動**: Actions タブ → *Renovate* → **Run workflow**
  - `logLevel`: `info`（既定）/ `debug`
  - `dryRun`: チェックすると PR やブランチを作成せず、何が更新されるかだけログ出力

## 初回のおすすめ

最初は手動実行で `dryRun` を ON にし、ログで対象リポジトリと更新内容を確認してから、スケジュール実行に任せると安全です。
