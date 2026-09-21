// Global (self-hosted) Renovate configuration.
//
// This file controls how the runner behaves across ALL repositories.
// Per-repository settings (package rules, schedules, etc.) belong in each
// repository's own renovate.json, not here — unless the rule has to hold even in
// repos that have no renovate.json.
//
// Docs: https://docs.renovatebot.com/self-hosted-configuration/
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

  // Automerge, widened one group at a time. First group: GitHub's own actions —
  // first-party, and one release fans the same bump across every repo at once.
  // Majors stay manual; `**` also matches sub-path actions (actions/cache/restore).
  // Where a ruleset requires an approving review the PR still waits for one, since
  // Renovate can't approve itself — the label is what the approver App keys off.
  packageRules: [
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
    // boykush/github-management fans these files out and rewrites them on every
    // `terraform apply`, so a bump merged into a copy is reverted — including the
    // actions/* ones the rule above would automerge. Global because they land in
    // repos with no renovate.json. Renovate still bumps the real source,
    // templates/zizmor.yml in github-management; merging there propagates it.
    {
      description:
        'Skip workflows Terraform overwrites; bump github-management/templates instead',
      matchFileNames: ['.github/workflows/zizmor.yml'],
      enabled: false,
    },
  ],

  // apm (microsoft/apm) の依存は Renovate に manager が無いので regex で拾う。file format の
  // 解釈であって repo ごとの方針ではなく、renovate.json を持たない repo（adr など）にも効かせたい
  // ためグローバルに置く。customManagers は mergeable なので repo 側の定義とは足し算になる。
  // 素の SHA を pin して main の HEAD を digest 更新で追う（tag は打たない運用）。
  customManagers: [
    {
      customType: 'regex',
      description: 'Track the HEAD of boykush/ai-plugins for SHA-pinned apm dependencies',
      managerFilePatterns: ['/(^|/)apm\\.yml$/'],
      matchStrings: [
        'boykush/ai-plugins/plugins/[^#\\s]+#(?<currentDigest>[0-9a-f]{40})',
      ],
      currentValueTemplate: 'main',
      depNameTemplate: 'boykush/ai-plugins',
      packageNameTemplate: 'https://github.com/boykush/ai-plugins',
      datasourceTemplate: 'git-refs',
    },
  ],

  // Open an onboarding PR on repositories that don't have a Renovate config yet.
  onboarding: true,
  onboardingConfig: {
    $schema: 'https://docs.renovatebot.com/renovate-schema.json',
    extends: ['config:recommended'],
  },
};
