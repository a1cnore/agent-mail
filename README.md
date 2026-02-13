# AgentMail CLI

A Bun + TypeScript CLI for sending mail via SMTP and receiving mail via IMAP polling.

## Features

- Reads config from `~/.agentmail/.env`
- Sends mail with `nodemailer`
- Polls IMAP inbox with `imapflow`
- Saves each received message and attachments to `~/.agentmail/messages`
- Supports one-shot receive and long-running watch polling

## Install

```bash
bun install
```

## One-Command Setup (Clone + Build + PATH)

You can run the setup script from any machine to clone, build, and install `agentmail`:

```bash
curl -fsSL https://raw.githubusercontent.com/a1cnore/aimail/main/setup.sh | bash
```

What it does:

- Clones (or updates) the repo to `~/.local/src/aimail`
- Runs `bun install`
- Builds standalone binary (`dist/agentmail`)
- Installs binary to `~/.local/bin/agentmail`
- Adds `~/.local/bin` to PATH in your shell rc file (if needed)
- Creates `~/.agentmail/.env` from `.env.example` if missing

Useful flags:

```bash
# Use current local checkout, skip clone/pull:
./setup.sh --repo-dir "$(pwd)"

# Custom install location:
./setup.sh --clone-dir "$HOME/tools/aimail" --bin-dir "$HOME/bin"
```

## Build Standalone Binary

Build a native standalone executable (no Bun runtime required on the target machine):

```bash
bun run build:standalone
```

Output binary:

- `dist/agentmail`

Run it directly:

```bash
./dist/agentmail --help
```

## Configure

Create `~/.agentmail/.env` with these keys:

- `AGENTMAIL_EMAIL`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `IMAP_HOST`
- `IMAP_PORT`
- `IMAP_SECURE`
- `IMAP_USER`
- `IMAP_PASS`

You can copy values from `.env.example`.

## Usage

Validate config:

```bash
bun run src/cli.ts config validate
```

Send email:

```bash
bun run src/cli.ts send \
  --to "to@example.com,other@example.com" \
  --subject "Test" \
  --text "Hello" \
  --attach ./report.pdf
```

Set polling defaults (`INBOX`, 60s if omitted):

```bash
bun run src/cli.ts receive setup --mailbox INBOX --interval 60
```

Receive once:

```bash
bun run src/cli.ts receive once
```

Watch receive loop:

```bash
bun run src/cli.ts receive watch
```

## Local Storage Layout

Received messages are saved under:

- `~/.agentmail/messages/<timestamp>_uid-<uid>/metadata.json`
- `~/.agentmail/messages/<timestamp>_uid-<uid>/body.txt`
- `~/.agentmail/messages/<timestamp>_uid-<uid>/body.html`
- `~/.agentmail/messages/<timestamp>_uid-<uid>/raw.eml`
- `~/.agentmail/messages/<timestamp>_uid-<uid>/attachments/*`
