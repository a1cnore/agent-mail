# AgentMail Workflows

## 1) First-Time Setup And Validation

1. Ensure `agentmail` binary is available.
```bash
agentmail --help
```
2. Create config directory and env file.
```bash
mkdir -p ~/.agentmail
```
3. Populate `~/.agentmail/.env` with required keys (see `config-and-storage.md`).
4. Validate configuration before operational commands.
```bash
agentmail config validate
```

## 2) Send Mail With Optional Attachments

1. Validate config.
```bash
agentmail config validate
```
2. Send text body mail.
```bash
agentmail send --to "alice@example.com" --subject "Hello" --text "Hi Alice"
```
3. Send HTML + attachments.
```bash
agentmail send \
  --to "alice@example.com,bob@example.com" \
  --subject "Report" \
  --html "<p>Attached report</p>" \
  --attach ./report.pdf \
  --attach ./summary.txt
```

## 3) Configure Receive Polling

1. Set mailbox and interval.
```bash
agentmail receive setup --mailbox INBOX --interval 60
```
2. Confirm polling file exists.
```bash
cat ~/.agentmail/polling.json
```

## 4) Receive Once

1. Validate config.
```bash
agentmail config validate
```
2. Poll once with saved mailbox.
```bash
agentmail receive once
```
3. Poll once with explicit mailbox override.
```bash
agentmail receive once --mailbox Support
```
4. Inspect saved artifacts.
```bash
ls -la ~/.agentmail/messages
```

## 5) Start And Stop Watch Loop

1. Ensure polling config exists.
```bash
agentmail receive setup --mailbox INBOX --interval 60
```
2. Start watcher.
```bash
agentmail receive watch
```
3. Stop watcher with `Ctrl+C` (SIGINT) or process SIGTERM.
4. Verify lock file is released on clean shutdown.
```bash
ls -la ~/.agentmail/receive-watch.lock
```

## 6) Configure Receive Hook

1. Create hook file with exact spelling.
```bash
mkdir -p ~/.agentmail/hooks
cat > ~/.agentmail/hooks/on_recieve.sh <<'SH'
#!/usr/bin/env bash
set -euo pipefail
echo "new mail: $AGENTMAIL_MESSAGE_SUBJECT from $AGENTMAIL_MESSAGE_FROM"
SH
chmod +x ~/.agentmail/hooks/on_recieve.sh
```
2. Trigger hook with one receive cycle.
```bash
agentmail receive once
```
3. Inspect hook side effects in message directory or external targets.

## 7) Query Conversation History

1. Query inbound messages for a sender.
```bash
agentmail conversation --sender "alice@example.com"
```
2. Include sent replies and return JSON.
```bash
agentmail conversation --sender "alice@example.com" --include-sent --json
```
3. Limit result size.
```bash
agentmail conversation --sender "alice@example.com" --include-sent --limit 10 --json
```

## 8) Operational Audit Checklist

- Run `agentmail config validate`.
- Confirm expected polling values in `~/.agentmail/polling.json`.
- Confirm watcher lock behavior if using continuous polling.
- Confirm incoming metadata exists under `~/.agentmail/messages/*/metadata.json`.
- Confirm sent metadata exists under `~/.agentmail/sent/*/metadata.json`.
- Use conversation query with `--json` for structured checks.
