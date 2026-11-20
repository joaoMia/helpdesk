# Security policy

HelpDesk is a local development and portfolio project, not a production service. The repository is public; assume that committed content is visible to everyone.

## Reporting a vulnerability

Please do not disclose vulnerabilities in a public issue, pull request, or discussion. Use [GitHub's private vulnerability reporting page for this repository](https://github.com/joaoMia/helpdesk/security/advisories/new) only if the private reporting form is available. If GitHub does not offer that form, do not send exploit details publicly; the repository owner must enable private reporting or publish a verified private contact channel before accepting reports.

The repository is confirmed public, but private vulnerability reporting could not be verified from the available read-only repository metadata. The owner should verify the setting in the repository's Security settings. No email address or alternate private contact has been invented for this policy.

When reporting privately, include affected paths/components, impact, reproduction conditions, and a suggested mitigation. Do not attach production data, credentials, tokens, or user records.

## Secrets and local data

- Keep `.env` and authentication secrets local and ignored by Git. `.env.example` must remain a non-secret template.
- Keep database dumps, backups, private attachments, local account credentials, logs, and screenshots with personal data outside the repository.
- Treat the private attachment storage and PostgreSQL backup as one recovery set; restrict access to both.
- Do not put server-only secrets in frontend variables or build artifacts.

## Supported deployment scope

The documented setup is for local development. Production deployment, supported response times, and a release support window have not been defined.
