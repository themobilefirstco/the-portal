# Build the next Portal with us

The goal is a dependable Google Meet room that another person can set up from the public guide. These are contribution opportunities, not promises of shipped features. Before starting a large change, open an issue to agree on its scope and acceptance criteria.

## Good first contributions

| Contribution | A useful result |
| --- | --- |
| Follow the setup guide on a clean Mac user | A sanitized setup report with exact blockers and proposed wording |
| Improve one troubleshooting entry | A reproducible symptom, diagnosis and tested recovery |
| Add an account-verification fixture | Synthetic markup covering a real failure, without copying private Google content |
| Check keyboard and screen-reader use | A reproducible accessibility issue and a focused fix |
| Review translated room names | A regression test for Unicode input and display |

## Reliability before redesign

1. **Prove onboarding:** fresh personal and Workspace accounts, consent, Keychain prompts, separate Chrome sign-in and permission recovery.
2. **Prove recovery:** overnight operation, reboot/login, network outages, Chrome crashes and device reconnection. Follow the [live acceptance checklist](acceptance.md).
3. **Reduce command blocking:** move slow browser and Google setup operations out of the command queue while preserving serialized state changes and prompt Leave actions.
4. **Harden installation:** test interrupted upgrades, concurrent installers, authenticated instance checks and recovery in a disposable macOS user.
5. **Harden native distribution:** the unsigned app is available; next are clean-Mac acceptance, Developer ID signing/notarization and safe updates.

## Stay focused

Google Meet, Google accounts and macOS are the current scope. No telemetry, hosted account service or additional conferencing provider is planned for this preview. Propose changes to permissions or security boundaries before implementation.

A small, verified PR is a great contribution. Use the [contribution guide](../CONTRIBUTING.md) and explain what you actually tested; passing fixtures are not evidence of live audio/video delivery.
