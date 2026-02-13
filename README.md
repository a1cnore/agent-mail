# AgentMail CLI

A CLI for sending mail via SMTP and receiving mail via IMAP polling.

## Features

- Reads config from `~/.agentmail/.env`
- Sends mail with `nodemailer`
- Polls IMAP inbox with `imapflow`
- Saves each received message and attachments to `~/.agentmail/messages`
- Supports one-shot receive and long-running watch polling

## Bundled Version (Recommended)

Use the setup script to install the bundled binary (`agentmail`) with no runtime command needed after install.

```bash
curl -fsSL https://raw.githubusercontent.com/a1cnore/aimail/main/setup.sh | bash
```

Installer behavior:

- Clones/updates repo at `~/.local/src/aimail`
- Builds bundled binary `dist/agentmail`
- Installs to `~/.local/bin/agentmail`
- Adds `~/.local/bin` to PATH (if needed)
- Creates `~/.agentmail/.env` from `.env.example` if missing

If repo is already cloned:

```bash
cd /path/to/aimail
./setup-local.sh
```

## Manual Build (Bundled Binary)

```bash
bun install
bun run build:standalone
./dist/agentmail --help
```

## Configuration

Create `~/.agentmail/.env` with:

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

Template source: `.env.example`

## Quick Usage

```bash
agentmail config validate
agentmail receive setup --mailbox INBOX --interval 60
agentmail receive watch
```

## Command Reference

### `agentmail` (top-level)

```bash
agentmail [options] [command]
```

Options:

- `-V, --version`
- `-h, --help`

Commands:

- `send [options]`
- `receive`
- `config`
- `help [command]`

### `agentmail send`

```bash
agentmail send --to <list> --subject <text> [options]
```

Options:

- `--to <list>` (required): comma-separated recipient addresses
- `--subject <text>` (required): message subject
- `--cc <list>`: comma-separated cc addresses
- `--bcc <list>`: comma-separated bcc addresses
- `--text <text>`: plain-text body
- `--html <html>`: HTML body
- `--attach <path>`: attachment file path (repeatable)
- `-h, --help`

Notes:

- At least one of `--text` or `--html` must be provided.

Example:

```bash
agentmail send \
  --to "to@example.com,other@example.com" \
  --subject "Test" \
  --text "Hello" \
  --attach ./report.pdf
```

### `agentmail receive`

```bash
agentmail receive [command]
```

Subcommands:

- `setup [options]`
- `once [options]`
- `watch`
- `help [command]`

### `agentmail receive setup`

```bash
agentmail receive setup [--mailbox <name>] [--interval <seconds>]
```

Options:

- `--mailbox <name>`: IMAP mailbox name (default: `INBOX`)
- `--interval <seconds>`: polling interval (default: `60`)
- `-h, --help`

Writes `~/.agentmail/polling.json`.

### `agentmail receive once`

```bash
agentmail receive once [--mailbox <name>]
```

Options:

- `--mailbox <name>`: IMAP mailbox name (overrides saved polling mailbox)
- `-h, --help`

### `agentmail receive watch`

```bash
agentmail receive watch
```

Options:

- `-h, --help`

Behavior:

- Loads polling config from `~/.agentmail/polling.json`
- Runs receive loop continuously until interrupted (`Ctrl+C`)

### `agentmail config`

```bash
agentmail config [command]
```

Subcommands:

- `validate`
- `help [command]`

### `agentmail config validate`

```bash
agentmail config validate
```

Options:

- `-h, --help`

## Setup Script Reference

### `setup.sh`

```bash
./setup.sh [options]
```

Options:

- `--repo-url <url>`
- `--repo-dir <path>`
- `--clone-dir <path>`
- `--bin-dir <path>`
- `--skip-path`
- `--skip-env-template`
- `-h, --help`

### `setup-local.sh`

```bash
./setup-local.sh [options]
```

Options:

- `--repo-dir <path>`
- `--bin-dir <path>`
- `--skip-path`
- `--skip-env-template`
- `-h, --help`

## Local Storage Layout

Received messages are stored under:

- `~/.agentmail/messages/<timestamp>_uid-<uid>/metadata.json`
- `~/.agentmail/messages/<timestamp>_uid-<uid>/body.txt`
- `~/.agentmail/messages/<timestamp>_uid-<uid>/body.html`
- `~/.agentmail/messages/<timestamp>_uid-<uid>/raw.eml`
- `~/.agentmail/messages/<timestamp>_uid-<uid>/attachments/*`
