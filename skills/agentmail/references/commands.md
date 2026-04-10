# AgentMail Commands

## Top-Level

```bash
agentmail [options] [command]
```

Top-level options:

- `--profile <name>`: use profile-specific storage under `~/.agentmail/profiles/<name>`.

Commands:

- `send [options]`
- `account`
- `receive`
- `config`
- `index`
- `conversation [options]`
- `dispatch`
- `service`

## Account Bootstrap

```bash
agentmail account create --name <profile> [options]
```

Options:

- `--name <profile>`: required profile name.
- `--email <address>`: optional account email; defaults to the profile name if it is an email.
- `--smtp-host`, `--smtp-port`, `--smtp-secure`, `--smtp-user`, `--smtp-pass`: required SMTP settings.
- `--imap-host`, `--imap-port`, `--imap-secure`, `--imap-user`, `--imap-pass`: required IMAP settings.
- `--mailbox <name>`: optional default mailbox; defaults to `INBOX`.
- `--interval <seconds>`: optional polling interval; defaults to `60`.
- `--agent <id>`: optional OpenClaw agent binding to write immediately.
- `--dispatch-config <path>`: optional shared dispatch config path.
- `--force`: overwrite existing `.env`.

Behavior:

- Creates the profile root under `~/.agentmail/profiles/<profile>`.
- Writes `.env` and default `polling.json`.
- Creates message/sent/hooks directories.
- Optionally updates the shared dispatch config.

## Send Mail

```bash
agentmail send --to <list> --subject <text> [options]
```

Options:

- `--to <list>`: required; comma-separated recipient list.
- `--subject <text>`: required; non-empty subject.
- `--cc <list>`: optional; comma-separated CC list.
- `--bcc <list>`: optional; comma-separated BCC list.
- `--text <text>`: optional plain text body.
- `--html <html>`: optional HTML body.
- `--in-reply-to <messageId>`: optional threading header.
- `--references <list>`: optional comma-separated threading header values.
- `--attach <path>`: optional attachment path; repeat flag to add multiple attachments.

Constraints:

- Provide at least one valid recipient in `--to`.
- Provide at least one body format: `--text` or `--html`.
- Use valid email addresses for recipients/cc/bcc.
- Ensure each attachment path is readable before sending.

Example:

```bash
agentmail send \
  --to "alice@example.com,bob@example.com" \
  --cc "ops@example.com" \
  --subject "Daily update" \
  --text "Job completed" \
  --in-reply-to "<original-message-id>" \
  --references "<ref-1>,<ref-2>" \
  --attach ./reports/daily.csv
```

## Receive Mail

### Configure Polling

```bash
agentmail receive setup [--mailbox <name>] [--interval <seconds>]
```

Options:

- `--mailbox <name>`: mailbox to poll; default `INBOX`.
- `--interval <seconds>`: integer > 0; default `60`.

Writes polling config to active profile `polling.json`.

### Poll Once

```bash
agentmail receive once [--mailbox <name>]
```

Behavior:

- Poll unseen mail from explicit mailbox, otherwise from `polling.json`, otherwise fallback `INBOX`.
- Save each message locally and mark each processed message as seen.
- Run hook script (if present) after message save.

### Watch Loop

```bash
agentmail receive watch
```

Behavior:

- Require existing polling config.
- Poll continuously at configured interval.
- Enforce single running watcher with lock file.

### Watch All Profiles

```bash
agentmail receive watch-all
```

Behavior:

- Explicit all-profiles entrypoint.
- Watches all configured profiles at once.
- Rejects top-level `--profile`.

## Config Validation

```bash
agentmail config validate
```

Behavior:

- Validate active profile `.env` existence and schema.
- Print missing keys and type/format issues.
- Exit non-zero on invalid config.

## Conversation Query

```bash
agentmail conversation [--sender <email> | --session <id>] [options]
```

Options:

- `--sender <email>`: sender email.
- `--session <id>`: exact session id.
- `--include-sent`: merge locally saved sent messages where sender appears in recipient fields.
- `--limit <count>`: positive integer max entries.
- `--json`: print machine-readable JSON entries.

Behavior:

- Read metadata from local storage only.
- Sort entries in ascending timeline order using `date` fallback `savedAt`.
- Apply `--limit` after merge/sort.

Example:

```bash
agentmail conversation --sender "alice@example.com" --include-sent --json
```

## Index Rebuild

```bash
agentmail index rebuild
```

Behavior:

- Rebuild the active profile's SQLite index from local `messages/` and `sent/`.

## Shared Dispatcher

```bash
agentmail dispatch bind --account <name> --agent <id> [--config <path>]
agentmail dispatch run [--config <path>]
agentmail dispatch once [--config <path>]
agentmail dispatch status [--verbose]
agentmail dispatch inspect [--account <name>] [--sender <email>] [--status <list>]
agentmail dispatch retry [--account <name>] [--sender <email>] [--include-deadletter]
agentmail dispatch doctor
```

Behavior:

- `bind`: write or update the profile-to-agent mapping in the shared dispatcher config.
- `run`: poll pending inbound jobs and route them to OpenClaw via `chat.send` with explicit mail session keys.
- `once`: execute a single dispatcher cycle.
- `status`: print queue counters by dispatch state (`--verbose` adds recent queue rows).
- `inspect`: show detailed inbound queue rows by profile/sender/status.
- `retry`: requeue failed or stalled rows immediately.
- `doctor`: validate bridge config, watcher locks, bindings, and stuck rows.

## Launchd Services

```bash
agentmail service install
agentmail service status
agentmail service uninstall
```

Behavior:

- `install`: write LaunchAgents for all configured watchers plus the shared dispatcher and bootstrap them.
- `status`: show installed/loaded service state.
- `uninstall`: boot out and remove the AgentMail LaunchAgents.
