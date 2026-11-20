# Changelog

This changelog records repository changes from commits and documented deliveries. Versions follow [Semantic Versioning](https://semver.org/). New entries go under **Unreleased** until the owner publishes the next version.

## Unreleased

No changes yet.

## 1.0.0 — 2026-11-20

First public version of HelpDesk.

### Added

- Integrated the role-based web application, operational API, PostgreSQL persistence, service catalog, ticket lifecycle, and project workflow documented in commit `8d4cc9b`.
- Added versioned project planning, activity-derived progress, authorized project conversations, and audit history as described by the current project contract.
- Added local setup, health-check, isolated database-test, and recovery guidance.
- Added attachment-only messages in ticket and project conversations; a message without text is accepted only when an authorized attachment is linked in the same transaction.
- Added private attachment formats for TXT, Markdown, CSV, DOCX, XLSX, PPTX, and static PDF files, with inert previews for images and text and authenticated downloads for Office and PDF documents.
- Added a GitHub Actions quality workflow that runs lint, formatting, Prisma validation, frontend tests, builds, typechecks, and backend unit tests with read-only repository permissions.
- Added the [MIT License](LICENSE).

### Changed

- Consolidated the current local operation and v1 contract in commit `1b0c3b3`.
- Clarified project planning after assignment, profile-specific actions, legacy update visibility, immutable plan versions, and the distinction between operational retirement and physical deletion.
- Removed the unused project `planning` and `updates` write routes and the `projects.update` permission; legacy updates remain readable in the unified project history.
- Made isolated integration tests split migration SQL safely and clean up their own schemas after success or failure.

### Security

- Rejected encrypted PDFs, PDFs with active content or embedded files, and Office documents with macros, embedded objects, or external relationships.
- Added a regression test confirming that the assigned technician reads projects through the operational workflow routes, while the legacy `GET /projects/:id` and `/projects/:id/history` routes remain limited to the requester and administrator.
- Documented local secret handling, private attachment storage, and responsible vulnerability reporting. The repository owner still needs to confirm whether GitHub private vulnerability reporting is enabled.
