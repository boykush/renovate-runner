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

  // Run against repositories under this owner, except explicit exclusions.
  autodiscover: true,
  autodiscoverFilter: [
    'boykush/*',
    '!boykush/archive-applications',
    '!boykush/scala-multi-project-base',
  ],

  // Commit through the GitHub API so commits are attributed to the App and
  // show up as "Verified".
  platformCommit: 'enabled',

  // Hold a new release for a few days before raising an update PR, to reduce
  // exposure to supply-chain attacks via freshly-published malicious versions.
  // Applies across every autodiscovered repository.
  minimumReleaseAge: '3 days',

  // boykush/github-management fans these files out and rewrites them on every
  // `terraform apply`, so a bump merged into a copy is silently reverted. Global
  // because they land in repos with no renovate.json to hold the rule. Renovate
  // still bumps the source, templates/zizmor.yml in github-management; merging
  // there and applying is what propagates. Add new distributed workflows here.
  packageRules: [
    {
      description:
        'Skip workflows Terraform overwrites; bump github-management/templates instead',
      matchFileNames: ['.github/workflows/zizmor.yml'],
      enabled: false,
    },
  ],

  // Open an onboarding PR on repositories that don't have a Renovate config yet.
  onboarding: true,
  onboardingConfig: {
    $schema: 'https://docs.renovatebot.com/renovate-schema.json',
    extends: ['config:recommended'],
  },
};
