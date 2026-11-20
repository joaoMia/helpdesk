# Contributing

HelpDesk is a personal portfolio project. Contributions should preserve the existing application, authorization model, audit trail, and database contracts. The project is released under the [MIT License](LICENSE); contributions are accepted under the same license. There is no production deployment process.

## Development setup

Follow the [local setup in README](README.md#local-setup). Use synthetic data and keep `.env`, backups, local attachments, and generated artifacts out of Git. Do not use a development database for integration tests.

## Change guidelines

- Keep a change focused and document its scope and observable result.
- Do not infer or introduce business rules from historical proposals; use the [current functional contract](docs/v1-contrato.md) and current module documentation.
- Enforce permissions and resource ownership on the backend. UI hiding is not authorization.
- Preserve append-only audit records, snapshots, published plan versions, and private attachment access controls.
- Do not add credentials, real user data, private files, dumps, or locally generated screenshots to a change.
- Do not change schema, apply migrations, or perform destructive data operations without a specific reviewed task.

## Validation

Run relevant checks from the root. The standard commands are listed under [Quality checks](README.md#quality-checks). Backend commands that prepare Prisma Client should run sequentially. Database integration tests must use a confirmed isolated test database.

## Git and review

Use the repository's [commit conventions](docs/40-conventional-commits.md) when a commit is authorized. Review the complete staged diff, including newly added files, for secrets and unrelated changes. Do not push, release, or deploy without explicit approval.
