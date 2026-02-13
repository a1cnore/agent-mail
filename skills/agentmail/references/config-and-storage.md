# AgentMail Config And Storage

## Required Environment File

Path:

- `~/.agentmail/.env`

Required keys:

- `AGENTMAIL_EMAIL`: sender identity email.
- `SMTP_HOST`: SMTP host.
- `SMTP_PORT`: integer port (1-65535).
- `SMTP_SECURE`: boolean string `true` or `false`.
- `SMTP_USER`: SMTP auth username.
- `SMTP_PASS`: SMTP auth password.
- `IMAP_HOST`: IMAP host.
- `IMAP_PORT`: integer port (1-65535).
- `IMAP_SECURE`: boolean string `true` or `false`.
- `IMAP_USER`: IMAP auth username.
- `IMAP_PASS`: IMAP auth password.

Validation command:

```bash
agentmail config validate
```

## Filesystem Layout

Base directory:

- `~/.agentmail`

Primary artifacts:

- `~/.agentmail/.env`: runtime credentials/config.
- `~/.agentmail/polling.json`: receive watch config.
- `~/.agentmail/messages/`: saved inbound messages.
- `~/.agentmail/sent/`: saved outbound messages.
- `~/.agentmail/hooks/on_recieve.sh`: optional receive hook script.
- `~/.agentmail/receive-watch.lock`: single-instance lock for watch mode.

## Polling Config Shape

`~/.agentmail/polling.json`:

```json
{
  "mailbox": "INBOX",
  "intervalSeconds": 60
}
```

Constraints:

- `mailbox`: non-empty string.
- `intervalSeconds`: integer >= 1.

## Inbound Message Persistence

Per message directory pattern:

- `~/.agentmail/messages/<timestamp>_uid-<uid>`

Typical files:

- `raw.eml`
- `body.txt` (if text body exists)
- `body.html` (if html body exists)
- `metadata.json`
- `attachments/*`

`metadata.json` shape:

```json
{
  "uid": 42,
  "messageId": "<id-or-null>",
  "from": ["Alice <alice@example.com>"],
  "to": ["agent@example.com"],
  "subject": "Hello",
  "date": "2026-02-13T00:00:00.000Z",
  "flags": ["\\Seen"],
  "savedAt": "2026-02-13T00:00:01.000Z",
  "attachments": [
    {
      "filename": "report.pdf",
      "contentType": "application/pdf",
      "size": 12345,
      "relativePath": "attachments/report.pdf"
    }
  ]
}
```

## Outbound Message Persistence

Per message directory pattern:

- `~/.agentmail/sent/<timestamp>_msg-<sanitized-message-id>`

Typical files:

- `body.txt` (if text body was sent)
- `body.html` (if html body was sent)
- `metadata.json`
- `attachments/*`

`metadata.json` shape:

```json
{
  "messageId": "<id-or-null>",
  "from": ["agent@example.com"],
  "to": ["alice@example.com"],
  "cc": [],
  "bcc": [],
  "subject": "Reply",
  "date": "2026-02-13T00:00:00.000Z",
  "savedAt": "2026-02-13T00:00:00.000Z",
  "attachments": [
    {
      "filename": "file.txt",
      "contentType": "application/octet-stream",
      "size": 3,
      "relativePath": "attachments/file.txt"
    }
  ]
}
```

## Collision Handling

- Duplicate attachment names are auto-suffixed: `file.txt`, `file(1).txt`, `file(2).txt`.
- Duplicate message directory names are auto-suffixed with `_1`, `_2`, etc.
- Unsafe filename characters are sanitized before writing.

## Hook Runtime Variables

When `~/.agentmail/hooks/on_recieve.sh` exists, AgentMail exports:

- `AGENTMAIL_HOOK_EVENT` (`on_recieve`)
- `AGENTMAIL_MAILBOX`
- `AGENTMAIL_MESSAGE_UID`
- `AGENTMAIL_MESSAGE_ID`
- `AGENTMAIL_MESSAGE_SUBJECT`
- `AGENTMAIL_MESSAGE_FROM`
- `AGENTMAIL_MESSAGE_TO`
- `AGENTMAIL_MESSAGE_SAVED_AT`
- `AGENTMAIL_MESSAGE_DATE`
- `AGENTMAIL_MESSAGE_DIR`
- `AGENTMAIL_MESSAGE_METADATA_FILE`

Hook failures are logged as warnings and do not block processing of received mail.
