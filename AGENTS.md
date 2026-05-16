# Agent Instructions

> `CLAUDE.md` is a symlink to this file. Both Claude Code and Codex read from the same source — edit `AGENTS.md` directly.

## Project Overview

**spotify-sync** is a tool to help DJs download and manage their music library locally for use at west coast swing socials.

The typical DJ workflow this tool supports:
1. Collect songs on Spotify over time
2. Periodically download new songs to a local machine
3. Tag songs with energy and vibe metadata (using VirtualDJ or similar software)
4. Play songs at a social using DJ software

The primary gap this tool fills: easily downloading songs from a Spotify playlist/library to local storage.

---

## This is a Vibe-Coded Project

This project is primarily built with AI coding agents. That creates a specific requirement: **agent instructions must be kept explicit and up to date**.

When you make a structural decision (tech stack choice, module layout, API design), document it here or in the relevant PRD. Future agents won't have your context — leave a clear trail.

If you discover that an existing instruction is wrong or outdated, update it. Don't silently work around it.

---

## Before You Start Any Task

1. **Read the relevant PRD** in `/prd/` before implementing a feature. If no PRD exists for the feature, flag it — don't implement against a blank spec.
2. **Explore the codebase first.** Understand existing patterns, conventions, and structure before writing a line.
3. **Raise blockers upfront.** Missing access, unclear requirements, or mismatched assumptions should surface before implementation starts, not halfway through.

---

## Development Guidelines

### Testing
All code must be tested. There are no exceptions.
- Unit tests for logic, transformation, and utility functions
- Integration tests for any external API calls (Spotify, download backends)
- Tests live alongside the code they cover (or in a `tests/` directory mirroring the source structure)
- Don't ship a feature without a test that would catch a regression

### Code Quality
- Follow existing patterns in the codebase. Don't introduce new conventions without a reason.
- Keep modules focused. If a file is doing too many things, that's a flag — raise it, don't silently refactor.
- No unnecessary abstractions. Solve the problem in front of you.

### Commits
Use [Conventional Commits](https://www.conventionalcommits.org/) style:
- `feat: add spotify playlist download`
- `fix: handle missing track metadata`
- `chore: update dependencies`

Never stage, commit, or push without explicit approval from the project owner.

### Security
- Never hardcode credentials, tokens, or secrets. Use environment variables.
- `.env` files must never be committed (already in `.gitignore`).
- Any new third-party dependency should be noted with a brief rationale — this project processes music files and communicates with external services, so supply chain hygiene matters.

---

## Architecture

> **Status: TBD** — stack not yet decided. Update this section once the tech stack is chosen.

Likely directions:
- **Backend**: Python (rich Spotify API and yt-dlp ecosystem) or Node.js
- **Frontend**: Web UI planned for later phases

When the stack is decided, document it here along with the module structure.

---

## PRD Directory

Product requirements live in `/prd/`. Each file describes a feature or user flow.

When implementing a feature:
- Reference the relevant PRD file
- If the PRD is ambiguous or missing, stop and ask rather than guessing

---

## Key External Integrations

- **Spotify API** — source of playlist and track metadata
- **Download backend** — TBD (yt-dlp is the leading candidate)
- **DJ software compatibility** — VirtualDJ is the primary target for metadata/tagging; others may be added later
