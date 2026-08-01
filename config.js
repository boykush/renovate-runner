// Global (self-hosted) Renovate configuration.
//
// This file controls how the runner behaves across ALL repositories.
// Per-repository settings (package rules, schedules, etc.) belong in each
// repository's own renovate.json, not here — the exception being a rule that
// must hold everywhere, including in repos that have no renovate.json of their
// own (see packageRules below).
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

  // Workflows that boykush/github-management distributes with Terraform (the
  // `github_repository_file.zizmor` resource) are overwritten from the template
  // on the next `terraform apply`. A bump merged into the distributed copy is
  // therefore a no-op that gets silently reverted, so Renovate must not raise
  // one anywhere.
  //
  // This belongs in the global config rather than in each repository's
  // renovate.json: the file is fanned out to every owned repo, including ones
  // with no renovate.json to put the rule in.
  //
  // The updates themselves are not lost. Renovate still bumps the source of the
  // fan-out, templates/zizmor.yml in github-management, which that repo tracks
  // via a `github-actions.managerFilePatterns` entry (patterns configured there
  // are added to Renovate's defaults, not swapped for them). Merging that PR and
  // applying Terraform is what propagates the new version everywhere.
  //
  // Add new Terraform-distributed workflows to matchFileNames as they appear.
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
