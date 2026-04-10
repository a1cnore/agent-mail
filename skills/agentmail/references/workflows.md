# AgentMail Workflows

For named-profile workflows, prepend commands with `--profile <name>` (for example `agentmail --profile work ...`) and use profile storage under `~/.agentmail/profiles/<name>/`.

## 1) First-Time Setup And Validation

1. Ensure `agentmail` binary is available.
```bash
agentmail --help
```
2. Create config directory and env file (default profile shown).
```bash
mkdir -p ~/.agentmail
```
3. Populate active profile `.env` with required keys (see `config-and-storage.md`).
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
For named profile `work`:
```bash
cat ~/.agentmail/profiles/work/polling.json
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
For named profile `work`:
```bash
ls -la ~/.agentmail/profiles/work/messages
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
For named profile `work`:
```bash
ls -la ~/.agentmail/profiles/work/receive-watch.lock
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
For named profile `work`:
```bash
mkdir -p ~/.agentmail/profiles/work/hooks
cat > ~/.agentmail/profiles/work/hooks/on_recieve.sh <<'SH'
#!/usr/bin/env bash
set -euo pipefail
echo "new mail: $AGENTMAIL_MESSAGE_SUBJECT from $AGENTMAIL_MESSAGE_FROM"
SH
chmod +x ~/.agentmail/profiles/work/hooks/on_recieve.sh
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
- Confirm expected polling values in active profile `polling.json`.
- Confirm watcher lock behavior if using continuous polling.
- Confirm incoming metadata exists under active profile `messages/*/metadata.json`.
- Confirm sent metadata exists under active profile `sent/*/metadata.json`.
- Use conversation query with `--json` for structured checks.
