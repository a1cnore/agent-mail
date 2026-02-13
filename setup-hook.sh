mkdir -p ~/.agentmail/hooks
cat > ~/.agentmail/hooks/on_recieve.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
echo "New mail from: $AGENTMAIL_MESSAGE_FROM | Subject: $AGENTMAIL_MESSAGE_SUBJECT"
# put any bash command here
EOF
chmod +x ~/.agentmail/hooks/on_recieve.sh

