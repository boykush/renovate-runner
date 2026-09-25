# renovate-runner

boykush 個人アカウントの**対象リポジトリを横断**して [Renovate](https://docs.renovatebot.com/) を実行する、セルフホスト型のランナーです。GitHub Actions 上でスケジュール実行し、GitHub App の権限で各リポジトリの依存更新 PR を自動作成します。

> managed by boykush/github-management

## 仕組み

| ファイル | 役割 |
| --- | --- |
| `.github/workflows/renovate.yml` | 4時間ごとに self-hosted Renovate を実行し、続けて `automerge` ラベルの付いた PR を承認 App でレビュー承認し、CI の完走を待って Renovate をもう一度走らせてマージまで済ませる。App token は boykush/workflows の共有 action が AWS KMS の署名で作る |
| `config.js` | セルフホスト用のグローバル設定（autodiscover / onboarding など）。**全リポジトリ共通**の挙動を定義 |
| `mise.toml` / `mise.lock` | Renovate の post-upgrade task が使う apm の版とチェックサム |
| `renovate.json` | この `renovate-runner` リポジトリ自身の依存設定（onboarding 済み扱い） |
| `.claude/skills/renovate-sweep/` | Renovate PR を横断で棚卸し・マージし、automerge 拡大まで検討する Claude Code スキル（ローカルの `gh` 権限で実行） |

- `autodiscover: true` + `autodiscoverFilter` により、GitHub App がインストールされた boykush 配下のリポジトリを自動的に対象にします。
- 各リポジトリ固有の設定は、そのリポジトリ内の `renovate.json` で行います（このリポジトリの `config.js` はグローバル設定専用）。
- Renovate に manager が無い `apm.yml`（[microsoft/apm](https://github.com/microsoft/apm)）の依存は `config.js` の `customManagers` が拾います。file format の解釈であってリポジトリごとの方針ではなく、`renovate.json` を持たないリポジトリにも効かせる必要があるためグローバルに置いています（`customManagers` は mergeable なので、リポジトリ側の定義とは足し算になります）。
- apm の依存は SHA で pin され、Renovate が main の HEAD へ上げます。main は `git-refs`（`git ls-remote`）で引きます。組み込みの `github-digest` は branch を名前順に 300 件までしか読まず、branch の多い repo（anthropics/claude-plugins-official など）では main に届かないためです。
  - 第三者の依存も `minimumReleaseAge` で待たせません。Renovate は digest だけの更新に日時を渡さないので、待たせようとしても PR はすぐ開き、`renovate/stability-days` が pending のまま残るだけになります。
- apm の依存を上げる PR では、同じ commit で `apm install` し直し、`apm.lock.yaml` と生成物（`.mcp.json` と、`.claude/` / `.codex/` / `.agents/` 配下）を追従させます（`config.js` の `postUpgradeTasks`）。Renovate が書き換えるのは `apm.yml` の SHA だけで、そのままだと lock と生成物が古いまま残るためです。
  - 対象はリポジトリ直下の `apm.yml` だけです（dotfiles の `apm/apm.yml` は user scope 向けで、生成物を repo に持ちません）。
  - commit に載せる範囲（`fileFilters`）は、targets（claude / codex）の展開先を root ごと指定しています。skill や hook を1つずつ挙げると、書き漏らした先が lock にだけ載って commit から落ちるためです。consumer の `apm.yml` に targets を足すときは、その target の root も `fileFilters` に足します。
  - apm は `env -i` で空の環境から起動します。Renovate は post-upgrade task に token 入りの git 設定を渡しますが、apm はそれがあると clone を拒否します。ai-plugins は public なので token は要らず、apm に token を見せずに済みます。
  - apm は `mise.toml` で版を、`mise.lock` でチェックサムを固定し、workflow が Renovate のコンテナから見える `/tmp/renovate-tools/apm` に置きます。apm の版を上げたら `mise lock -p linux-x64,linux-arm64,macos-arm64,macos-x64` で `mise.lock` も作り直します。
- automerge は PR を開いたのと同じ run の中で完結させます。Renovate がマージするのは自身の実行中だけなので、1 pass では次回実行まで待つことになります。30日を計測したところ、承認と CI は PR 作成から約6分で揃うのに、実際のマージは中央値5時間後でした（`schedule` の配送自体が中央値2時間半遅れ、1日6回のうち4.6回しか届いていません）。`approve` の後に CI の完走を待ち、`automerge` ラベルの PR を持つ repo だけに絞って Renovate をもう一度走らせます（`RENOVATE_REPOSITORIES`。環境変数は `config.js` より優先されます）。
- まだ Renovate 設定が無いリポジトリには onboarding PR が自動で作成されます。

## 認証

GitHub App を 2 つ使います。横断実行を担う **Renovate App** と、その PR に approve を付けるだけの **承認用 App** です。App 本体・権限・払い出しは、いずれも `boykush/github-management` で管理されます。

**この repo が持つのは App の名前だけです**（`renovate` / `pr-approver`）。トークンは [boykush/workflows](https://github.com/boykush/workflows) の `github-app-token` action が発行し、App の識別子・KMS の alias・IAM role はその名前から引かれます。Variables も Secrets も要りません。

**秘密鍵はこの repo に置きません。** 2つの App の private key は AWS KMS の中にあり、取り出せません。action（実体は [`suzuki-shunsuke/create-github-app-token-aws-kms`](https://github.com/suzuki-shunsuke/create-github-app-token-aws-kms)）は **JWT の署名だけを KMS に任せて**インストールトークンを受け取ります。AWS の認証は run の OIDC で、App ごとに別の IAM role（できるのは `kms:Sign` だけ）。key と role を作るのは `boykush/infrastructure-as-code` の `terraform/aws.tf` です。

期限の無い鍵を repo secret に置かないための構成で、鍵が漏れて無期限にトークンを発行され続ける経路が消えます。代わりに残るのは「署名を頼める run」だけで、そちらは IAM で剥がせます。

**Renovate App** の権限: Contents / Pull requests / Issues / Workflows / Commit statuses（いずれも Read and write）と Checks（Read-only）。Commit statuses は `minimumReleaseAge` が各ブランチに付ける `renovate/stability-days` ステータスの書き込みに使います。Checks は automerge の前に CI の結果（check run）を読むのに使います。public repo の check run は権限なしでも読めますが、private repo では読めず、Renovate がブランチを未完了とみなしたまま automerge しません。

**承認用 App** の権限: Pull requests（Read and write）のみ。public repo は approve 1 件を必須とし、GitHub は PR の作成者自身による approve を認めないため、Renovate は自分の PR のゲートを自力で通せません。`renovate.yml` の `approve` job がこの App で approve を付け、要件を回避せずに満たします。

## 実行

- **スケジュール**: 4 時間ごと（`cron: '0 */4 * * *'`）。頻度の変更は `.github/workflows/renovate.yml` の cron を編集。
- **手動**: Actions タブ → *Renovate* → **Run workflow**
  - `logLevel`: `info`（既定）/ `debug`
  - `dryRun`: チェックすると PR やブランチを作成せず、何が更新されるかだけログ出力

## 初回のおすすめ

最初は手動実行で `dryRun` を ON にし、ログで対象リポジトリと更新内容を確認してから、スケジュール実行に任せると安全です。
