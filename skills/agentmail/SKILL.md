---
name: agentmail
description: "Operate the AgentMail CLI across the full feature set: setup context, configuration validation, SMTP sending, IMAP receive polling (setup/once/watch), receive hook automation, conversation queries, and local message-store inspection under ~/.agentmail. Use when a request involves running or troubleshooting `agentmail` commands, configuring `~/.agentmail/.env`, working with `~/.agentmail/hooks/on_recieve.sh`, or inspecting saved message metadata/attachments."
---

# AgentMail

## Overview

Use the global `agentmail` binary only.

Run this skill when the task is to operate, troubleshoot, or audit AgentMail workflows end-to-end.

## Workflow Router

Map user intent to command family and reference docs:

- Validate or diagnose config: run `agentmail config validate`; read `references/config-and-storage.md` and `references/troubleshooting.md`.
- Send outbound mail: run `agentmail send ...`; read `references/commands.md` and `references/workflows.md`.
- Configure receive polling: run `agentmail receive setup ...`; read `references/commands.md` and `references/workflows.md`.
- Fetch new inbound messages once: run `agentmail receive once`; read `references/workflows.md` and `references/config-and-storage.md`.
- Run continuous mailbox watch: run `agentmail receive watch`; read `references/workflows.md` and `references/troubleshooting.md`.
- Configure or debug receive hooks: inspect `~/.agentmail/hooks/on_recieve.sh`; read `references/workflows.md` and `references/troubleshooting.md`.
- Query conversation history: run `agentmail conversation ...`; read `references/commands.md` and `references/workflows.md`.
- Inspect local storage artifacts: inspect paths in `~/.agentmail`; read `references/config-and-storage.md`.

## Execution Rules

- Validate environment first for operational tasks: run `agentmail config validate` before send/receive/watch unless the user explicitly asks to skip.
- Preserve exact hook file naming: use `on_recieve.sh` (project spelling), not `on_receive.sh`.
- Require message body content when sending: include at least one of `--text` or `--html`.
- Prefer machine-readable output for automation: use `agentmail conversation --json` when the result will be parsed.
- Set receive polling before watch: run `agentmail receive setup` before `agentmail receive watch` on new environments.
- Treat hook failures as non-fatal: incoming messages are still saved and marked seen when hook execution fails.
- Handle watch lock conflicts carefully: check `~/.agentmail/receive-watch.lock` and running PID before deleting stale locks.

## Reference Loading Guide

Load only the reference required for the task:

- `references/commands.md`: command syntax, flags, constraints, and examples.
- `references/config-and-storage.md`: env requirements, path layout, metadata schema, and persistence behavior.
- `references/workflows.md`: step-by-step operational playbooks.
- `references/troubleshooting.md`: failure signatures, root causes, and corrective actions.

## Do / Don't

Do:

- Use exact CLI help-compatible syntax.
- Confirm required inputs and constraints before executing commands.
- Use mailbox and sender values exactly as supplied unless normalization is required.
- Surface absolute paths for saved artifacts during debugging.

Don't:

- Fall back to `bun run src/cli.ts`; this skill assumes global `agentmail` usage.
- Rename hook files or environment keys.
- Start `receive watch` without polling config unless intentionally reproducing that error.
- Assume empty conversation output means failure; verify sender match rules first.
