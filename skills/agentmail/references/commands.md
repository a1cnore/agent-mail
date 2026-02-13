# AgentMail Commands

## Top-Level

```bash
agentmail [options] [command]
```

Commands:

- `send [options]`
- `receive`
- `config`
- `conversation [options]`

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

Writes polling config to `~/.agentmail/polling.json`.

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

## Config Validation

```bash
agentmail config validate
```

Behavior:

- Validate `~/.agentmail/.env` existence and schema.
- Print missing keys and type/format issues.
- Exit non-zero on invalid config.

## Conversation Query

```bash
agentmail conversation --sender <email> [options]
```

Options:

- `--sender <email>`: required sender email.
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
