// Global (self-hosted) Renovate configuration.
//
// This file controls how the runner behaves across ALL repositories.
// Per-repository settings (package rules, schedules, etc.) belong in each
// repository's own renovate.json, not here.
//
// Docs: https://docs.renovatebot.com/self-hosted-configuration/
module.exports = {
  platform: 'github',

  // Run against every repository the GitHub App can access under this owner.
  autodiscover: true,
  autodiscoverFilter: ['boykush/*'],

  // Commit through the GitHub API so commits are attributed to the App and
  // show up as "Verified".
  platformCommit: 'enabled',

  // Open an onboarding PR on repositories that don't have a Renovate config yet.
  onboarding: true,
  onboardingConfig: {
    $schema: 'https://docs.renovatebot.com/renovate-schema.json',
    extends: ['config:recommended'],
  },
};
