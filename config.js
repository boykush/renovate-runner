// Global (self-hosted) Renovate configuration.
//
// This file controls how the runner behaves across ALL repositories.
// Per-repository settings (package rules, schedules, etc.) belong in each
// repository's own renovate.json, not here — unless the rule has to hold even in
// repos that have no renovate.json.
//
// Docs: https://docs.renovatebot.com/self-hosted-configuration/
// boykush 自身が公開するもの。datasource ごとに package 名の形が違うので、形の数だけ並べる。
const OWN_PACKAGES = [
  'boykush/**',
  'https://github.com/boykush/**',
  'github.com/boykush/**',
  'ghcr.io/boykush/**',
];

module.exports = {
  platform: 'github',

  // Run against every repository under this owner.
  autodiscover: true,
  autodiscoverFilter: [
    'boykush/*',
  ],

  // Commit through the GitHub API so commits are attributed to the App and
  // show up as "Verified".
  platformCommit: 'enabled',

  // Hold a new release for a few days before raising an update PR, to reduce
  // exposure to supply-chain attacks via freshly-published malicious versions.
  // Applies across every autodiscovered repository.
  minimumReleaseAge: '3 days',

  // Security fixes are Dependabot's: github-management turns its security updates on
  // and boykush/workflows' dependabot-merge carries them to merge. Renovate keeps to
  // version updates, so the App goes without Dependabot alerts: read.
  vulnerabilityAlerts: {
    enabled: false,
  },

  // Go の repo は CI で `go mod tidy -diff` を回すので、tidy しない bump は go.sum に古い行を残して落ちる。
  // renovate.json を持たない Go の repo（adr）にも効かせるため、repo 側ではなくここに置く。
  postUpdateOptions: ['gomodTidy'],

  // Automerge, widened one group at a time. First group: GitHub's own actions —
  // first-party, and one release fans the same bump across every repo at once.
  // Majors stay manual; `**` also matches sub-path actions (actions/cache/restore).
  // Where a ruleset requires an approving review the PR still waits for one, since
  // Renovate can't approve itself — the label is what the approver App keys off.
  packageRules: [
    // major は Dependency Dashboard でチェックを入れたものだけ PR にする。壊れやすい major が開いたまま
    // repo の PR 上限（10）を埋め、後ろの更新が Rate-Limited で止まるのを防ぐ。後の rule で外せる。
    {
      description: 'Hold major updates until approved on the Dependency Dashboard',
      matchUpdateTypes: ['major'],
      dependencyDashboardApproval: true,
    },
    {
      description: 'Automerge non-major updates to GitHub-authored actions',
      matchManagers: ['github-actions'],
      matchPackageNames: ['actions/**'],
      matchUpdateTypes: ['minor', 'patch', 'digest', 'pinDigest'],
      automerge: true,
      addLabels: ['automerge'],
    },
    // Named one by one, not widened to `**`; add an action once its cadence earns it.
    // Both are SHA-pinned and CI-only, so the workflow a bad bump breaks is the same
    // one gating its merge.
    {
      description: 'Automerge non-major updates to high-cadence third-party actions',
      matchManagers: ['github-actions'],
      matchPackageNames: ['jdx/mise-action', 'anthropics/claude-code-action'],
      matchUpdateTypes: ['minor', 'patch', 'digest', 'pinDigest'],
      automerge: true,
      addLabels: ['automerge'],
    },
    // mise-action は major も通す。壊す bump は toolchain を入れる step そのものを落とし、
    // 後ろの step が走らないので CI が止める。
    {
      description: 'Automerge major updates to jdx/mise-action too',
      matchManagers: ['github-actions'],
      matchPackageNames: ['jdx/mise-action'],
      matchUpdateTypes: ['major'],
      dependencyDashboardApproval: false,
      automerge: true,
      addLabels: ['automerge'],
    },
    // golangci-lint は Go の repo がどれも mise で pin しており、1 リリースが全 Go repo に同じ bump の
    // PR を開く。lint を回す CI の job が全 PR でその版を入れて走るので、壊す bump はその job が止める。
    // GitHub の auto-merge を使う repo は required check しか待たないので、その job が required で
    // あることが前提。renovate.json を持たない Go repo にも効かせるため、repo 側ではなくここに置く。
    {
      description: 'Automerge non-major golangci-lint updates',
      matchManagers: ['mise'],
      matchDepNames: ['golangci-lint'],
      matchUpdateTypes: ['minor', 'patch'],
      automerge: true,
      addLabels: ['automerge'],
    },
    // boykush/github-management fans these files out and rewrites them on every
    // `terraform apply`, so a bump merged into a copy is reverted — including the
    // actions/* ones the rule above would automerge. Global because they land in
    // repos with no renovate.json. Renovate bumps the real sources under that
    // repo's templates/ instead, so every file it fans out belongs in the list below.
    {
      description:
        'Skip workflows Terraform overwrites; bump github-management/templates instead',
      matchFileNames: [
        '.github/workflows/zizmor.yml',
        '.github/workflows/gitleaks.yml',
        '.github/workflows/dependabot-merge.yml',
      ],
      enabled: false,
    },
    // apm.yml の SHA だけ上げると、commit 済みの apm.lock.yaml と生成物が古いまま残る。bump と
    // 同じ commit で apm install し直す。env -i は、Renovate が渡す token 入りの git 設定を apm に
    // 見せないため（apm はその設定があると clone を拒否する。拾う package は public で token は不要）。
    // dotfiles の apm/apm.yml は user scope 向けで生成物を repo に持たないので、直下に絞る。
    {
      description: 'Regenerate what apm install derives from apm.yml in the same commit as the bump',
      matchManagers: ['custom.regex', 'apm'],
      matchFileNames: ['apm.yml'],
      postUpgradeTasks: {
        commands: ['env -i HOME=/home/ubuntu PATH=/usr/bin:/bin /tmp/renovate-tools/apm/apm install'],
        // targets（claude / codex）の展開先は root ごと拾う。apm 自身も .claude/ と .codex/・.agents/
        // を target の持ち物として扱う。primitive ごとに挙げると、書き漏らした先が lock にだけ載って
        // 黙って commit から落ちる。.mcp.json は Claude の MCP 設定で、.claude/ の外にある。
        fileFilters: ['.mcp.json', '.claude/**', '.codex/**', '.agents/**', 'apm.lock.yaml'],
        executionMode: 'branch',
      },
    },
    // apm の manager は自分でも apm install を走らせるが、token 入りの git 設定を見せずに走らせる
    // 手立てが無い。作り直しは上の postUpgradeTasks に任せる。
    {
      description: 'Leave apm install to the postUpgradeTasks above',
      matchManagers: ['apm'],
      skipArtifactsUpdate: true,
    },
    // workflows も自前で、呼び出し側は素の SHA で固定している。main の1 commit が、その reusable
    // workflow や action を呼ぶ全 repo に同じ digest bump の PR を開くので、待たずに automerge する。
    // ai-review を入れた repo でも Renovate の PR は ai-review の対象外で、承認は sweep が出す。
    // 自前の repo どうしが互いを素の SHA で固定すると、片方の bump の merge がもう片方の bump を呼び、
    // run のたびに両方の main が動き続ける（adr と ai-plugins がそうなり、apm.yml を持つ全 repo に
    // digest の PR が出続けた）。互いに参照するなら、片方は tag で固定する。
    {
      description: 'Automerge digest updates to boykush/workflows',
      matchManagers: ['custom.regex'],
      matchDepNames: ['boykush/workflows'],
      matchUpdateTypes: ['digest'],
      automerge: true,
      addLabels: ['automerge'],
      rebaseWhen: 'conflicted',
    },
    // workflows の digest の PR は、base が進んでも衝突しない限り作り直さない（上の rebaseWhen）。
    // 既定（automerge 付きでは behind-base-branch）だと、github-management の配布 commit や
    // 別の bump の merge で main が進むたびに開いている PR が rebase され、private repo
    // （Free: 2,000 Actions 分/月）ではそのたびに PR の CI が走り直す。public repo の ruleset は
    // 最新への追従を求めていない（github-management の modules/ruleset、strict = false）ので、
    // 遅れた branch のまま automerge できる。新しい digest への更新はこれまでどおり入る。
    // github-actions の manager も同じ uses: の行を拾いうるが、版の書かれていない SHA は上げられない。
    // 下の customManager に任せ、二重に扱わせない。
    {
      description: 'Leave boykush/workflows pins to the git-refs manager',
      matchManagers: ['github-actions'],
      matchDepNames: ['boykush/workflows', 'boykush/workflows/**'],
      enabled: false,
    },
    // apm の依存は第三者のものも待たせない。Renovate は digest だけの更新に日時を渡さないので、
    // minimumReleaseAge を掛けても待つことにはならず、PR はすぐ開いて renovate/stability-days が
    // pending のまま残るだけになる。
    {
      description: "Don't hold back apm dependencies",
      matchManagers: ['custom.regex'],
      matchFileNames: ['/(^|/)apm\\.yml$/'],
      minimumReleaseAge: null,
    },
    // boykush 自身が出したものは待たない。minimumReleaseAge は第三者が公開した直後の悪性版を
    // 避けるためのもの。
    {
      description: "Don't hold back boykush's own releases",
      matchPackageNames: OWN_PACKAGES,
      minimumReleaseAge: null,
    },
    // 自前のものは待たずに取り込む。出した本人が中身を知っているので、手で見る段を挟まない。
    // gate は取り込む側の repo の CI。major は壊す変更を含みうるので手で見る。apm.yml の依存
    // （tag で固定した自前の plugin）は agent 向けの設定で CI では確かめようがなく、gate は上の
    // postUpgradeTasks の apm install が担う: 失敗すると renovate/artifacts が赤で残り、automerge
    // しない。dotfiles の apm/apm.yml はそこを通らないが、user scope に反映されるのは手で
    // apm:apply したときだけ。
    {
      description: "Automerge non-major updates to boykush's own releases",
      matchPackageNames: OWN_PACKAGES,
      matchUpdateTypes: ['minor', 'patch', 'digest', 'pinDigest'],
      automerge: true,
      addLabels: ['automerge'],
    },
  ],

  // tag をコメントに添えた apm の依存（#<SHA> # <tag>）は Renovate の apm manager が tag で追う。
  // その manager が「追う版が無い」と飛ばす、コメントの無い素の SHA だけをここで拾い、main の HEAD
  // を digest 更新で追う。行末まで SHA で終わる行に絞るのは、tag 付きの行を二重に扱わないため。
  // renovate.json を持たない repo（adr など）にも効かせたいのでグローバルに置く。
  customManagers: [
    {
      customType: 'regex',
      description: 'Track the HEAD of SHA-pinned apm dependencies',
      managerFilePatterns: ['/(^|/)apm\\.yml$/'],
      // owner/repo を depName に取る。以降の subpath は package の位置なので依存の同一性に入れない。
      matchStrings: [
        '(?<depName>[\\w.-]+/[\\w.-]+)(?:/[^#\\s]+)?#(?<currentDigest>[0-9a-f]{40})[ \\t]*(?:\\r?\\n|$)',
      ],
      currentValueTemplate: 'main',
      // git-refs は git ls-remote で全 ref を読むので、branch がいくつあっても main を引ける。
      // github-digest は branch を名前順に 300 件までしか読まず、それより後ろに main が来る repo
      // （claude-plugins-official など）では digest が引けない。
      packageNameTemplate: 'https://github.com/{{depName}}',
      datasourceTemplate: 'git-refs',
    },
    // boykush/workflows の reusable workflow と action も、呼び出し側が素の SHA で固定し、main の HEAD
    // を追う（tag は打たない運用）。github-actions の manager は版の書かれていない SHA を上げない。
    {
      customType: 'regex',
      description: 'Track the HEAD of SHA-pinned boykush/workflows callers',
      managerFilePatterns: ['/(^|/)\\.github/workflows/[^/]+\\.ya?ml$/'],
      matchStrings: [
        'uses:\\s*(?<depName>boykush/workflows)/[^@\\s]+@(?<currentDigest>[0-9a-f]{40})',
      ],
      currentValueTemplate: 'main',
      packageNameTemplate: 'https://github.com/{{depName}}',
      datasourceTemplate: 'git-refs',
    },
  ],

  // postUpgradeTasks で走らせてよいコマンド。シェルを通さない既定のまま、完全一致で許す。
  // apm は .github/workflows/renovate.yml が、Renovate のコンテナから見える /tmp に置いたもの。
  // HOME と PATH はコンテナ（Renovate の image）の値。
  allowedCommands: [
    '^env -i HOME=/home/ubuntu PATH=/usr/bin:/bin /tmp/renovate-tools/apm/apm install$',
    // scraps の jslibs/ と fonts/: bump と同じ commit で、crate に commit 済みの写しを作り直す。
    // rule と installTools（node・pnpm）は scraps の renovate.json が持つ。pnpm は依存の install
    // script を既定で走らせないので、ここで動くのはその repo 自身の build script だけ。
    '^pnpm --dir jslibs install$',
    '^pnpm --dir jslibs run build$',
    '^pnpm --dir fonts install$',
    '^pnpm --dir fonts run build$',
  ],

  // Open an onboarding PR on repositories that don't have a Renovate config yet.
  onboarding: true,
  onboardingConfig: {
    $schema: 'https://docs.renovatebot.com/renovate-schema.json',
    extends: ['config:recommended'],
  },
};
