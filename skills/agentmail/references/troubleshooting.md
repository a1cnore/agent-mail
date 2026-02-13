# AgentMail Troubleshooting

## Invalid Or Missing Environment Configuration

Symptoms:

- `agentmail config validate` reports missing keys.
- Send/receive commands fail with environment parsing errors.

Causes:

- Missing `~/.agentmail/.env`.
- Empty required values.
- Invalid types (for example `SMTP_SECURE=yes` instead of `true`/`false`).

Actions:

1. Recreate or fix `~/.agentmail/.env` with all required keys.
2. Ensure secure flags are exactly `true` or `false`.
3. Ensure port values are integers.
4. Re-run:
```bash
agentmail config validate
```

## Attachment Path Errors During Send

Symptoms:

- `agentmail send` fails before SMTP submission.

Causes:

- Attachment path does not exist.
- Attachment path is unreadable.

Actions:

1. Check path and permissions.
```bash
ls -la /path/to/attachment
```
2. Retry `agentmail send` with valid paths.

## Missing Polling Config For Watch Mode

Symptoms:

- `agentmail receive watch` fails with missing polling config message.

Cause:

- `~/.agentmail/polling.json` has not been created.

Actions:

1. Create config:
```bash
agentmail receive setup --mailbox INBOX --interval 60
```
2. Retry:
```bash
agentmail receive watch
```

## Active Or Stale Watch Lock

Symptoms:

- Watch startup reports another running watcher with a PID.

Causes:

- Another watch process is active.
- Prior process crashed and left stale lock file.

Actions:

1. Check running process first.
```bash
ps -p <pid>
```
2. If process is active, stop that process gracefully.
3. If PID is stale, remove lock file:
```bash
rm -f ~/.agentmail/receive-watch.lock
```
4. Restart watch:
```bash
agentmail receive watch
```

## Hook Script Failures

Symptoms:

- Receive logs show hook warning/failure.

Cause:

- Hook script exited non-zero or was terminated.

Important behavior:

- Hook failure is non-fatal.
- Message save and seen-flag behavior still continue.

Actions:

1. Verify hook file path and execute bit.
```bash
ls -la ~/.agentmail/hooks/on_recieve.sh
```
2. Test script manually with a controlled environment.
3. Add strict shell options and logging in hook.

## No Conversation Results

Symptoms:

- `agentmail conversation --sender ...` returns no entries.

Causes:

- Sender email mismatch.
- No matching saved received messages.
- Sent entries excluded because `--include-sent` was omitted.

Actions:

1. Normalize sender to lowercase email and retry.
2. Include sent records when needed:
```bash
agentmail conversation --sender "alice@example.com" --include-sent --json
```
3. Inspect local metadata under:
- `~/.agentmail/messages/*/metadata.json`
- `~/.agentmail/sent/*/metadata.json`

## Receive Finds No New Mail

Symptoms:

- `agentmail receive once` reports no unseen messages.

Causes:

- Mailbox has no unseen messages.
- Wrong mailbox selected.

Actions:

1. Poll explicit mailbox for confirmation:
```bash
agentmail receive once --mailbox INBOX
```
2. Adjust default mailbox:
```bash
agentmail receive setup --mailbox <expected-mailbox> --interval 60
```
