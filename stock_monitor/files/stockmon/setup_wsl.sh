#!/usr/bin/env bash
# One-shot WSL setup for stockmon as a *user* systemd service.
# Run once from inside WSL (Ubuntu):  bash setup_wsl.sh
# It will sudo a couple of times (apt + enable-linger); enter your password when asked.
set -euo pipefail

SRC="/mnt/c/Users/4e/stock_monitor/files/stockmon"
DEST="$HOME/stockmon"
UNIT_DIR="$HOME/.config/systemd/user"

echo "==> 1/7  Installing python venv support (needs sudo)"
sudo apt-get update -qq
sudo apt-get install -y python3-venv >/dev/null

echo "==> 2/7  Staging project into $DEST (Linux filesystem, not /mnt/c)"
mkdir -p "$DEST"
cp -a "$SRC/." "$DEST/"
# Drop the Windows venv and the nested zip-duplicate if they came along.
rm -rf "$DEST/.venv" "$DEST/stockmon"

echo "==> 3/7  Building Linux venv + installing requirements"
python3 -m venv "$DEST/.venv"
"$DEST/.venv/bin/pip" install --quiet --upgrade pip
"$DEST/.venv/bin/pip" install --quiet -r "$DEST/requirements.txt" tzdata

echo "==> 4/7  Ensuring .env exists (EnvironmentFile is required by the unit)"
[ -f "$DEST/.env" ] || cp "$DEST/.env.example" "$DEST/.env"

echo "==> 5/7  Seeding DB (marks today's filings as seen, sends NO alerts)"
( cd "$DEST" && ./.venv/bin/python -m monitor.main --seed )

echo "==> 6/7  Installing user systemd unit"
mkdir -p "$UNIT_DIR"
cat > "$UNIT_DIR/stockmon.service" <<UNIT
[Unit]
Description=Indian Stock Announcement Monitor (WSL user service)
After=network-online.target
Wants=network-online.target

[Service]
WorkingDirectory=%h/stockmon
EnvironmentFile=%h/stockmon/.env
ExecStart=%h/stockmon/.venv/bin/python -m monitor.main
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
UNIT

systemctl --user daemon-reload
systemctl --user enable --now stockmon.service

echo "==> 7/7  Enabling linger so the service runs with no terminal open (needs sudo)"
sudo loginctl enable-linger "$USER"

echo
echo "Done. Status:"
systemctl --user --no-pager status stockmon.service || true
echo
echo "Tail logs with:  journalctl --user -u stockmon -f"
