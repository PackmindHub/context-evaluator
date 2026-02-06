#!/bin/bash
set -e

# Context Evaluator Deployment Script
# This script deploys the Linux binary as a systemd service

# Configuration
APP_NAME="context-evaluator"
INSTALL_DIR="/opt/${APP_NAME}"
SERVICE_USER="www-data"
SERVICE_GROUP="www-data"
PORT=3001
HOST="127.0.0.1"  # Bind to localhost since nginx will proxy

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    error "Please run as root (use sudo)"
fi

# Check if binary exists (default path, override with BINARY_PATH env var)
BINARY_PATH="${BINARY_PATH:-dist/bin/context-evaluator-linux-x64}"
if [ ! -f "$BINARY_PATH" ]; then
    error "Binary not found at $BINARY_PATH. Please build first: bun run build"
fi

info "Starting deployment of Context Evaluator..."

# Step 1: Create installation directory
info "Creating installation directory..."
mkdir -p "$INSTALL_DIR"

# Step 2: Copy binary
info "Copying binary to $INSTALL_DIR..."
cp "$BINARY_PATH" "$INSTALL_DIR/"
chmod +x "$INSTALL_DIR/context-evaluator-linux-x64"

# Step 3: Create systemd service file
info "Creating systemd service..."
cat > /etc/systemd/system/${APP_NAME}.service <<EOF
[Unit]
Description=Context Evaluator API Server
After=network.target
Documentation=https://github.com/anthropics/agents-md-evaluator

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_GROUP}
WorkingDirectory=${INSTALL_DIR}
Environment="HOST=${HOST}"
Environment="PORT=${PORT}"
Environment="NODE_ENV=production"
ExecStart=${INSTALL_DIR}/context-evaluator-linux-x64 api --host ${HOST} --port ${PORT}
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${APP_NAME}

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${INSTALL_DIR}

[Install]
WantedBy=multi-user.target
EOF

# Step 4: Set ownership
info "Setting ownership..."
chown -R ${SERVICE_USER}:${SERVICE_GROUP} "$INSTALL_DIR"

# Step 5: Reload systemd
info "Reloading systemd daemon..."
systemctl daemon-reload

# Step 6: Enable and start service
info "Enabling service to start on boot..."
systemctl enable ${APP_NAME}

info "Starting service..."
systemctl start ${APP_NAME}

# Step 7: Wait for service to start
sleep 2

# Step 8: Check service status
info "Checking service status..."
if systemctl is-active --quiet ${APP_NAME}; then
    info "✓ Service is running"
    systemctl status ${APP_NAME} --no-pager -l
else
    error "Service failed to start. Check logs with: sudo journalctl -u ${APP_NAME} -n 50"
fi

# Step 9: Test the API
info "Testing API endpoint..."
if curl -s http://${HOST}:${PORT}/api/health > /dev/null; then
    info "✓ API health check passed"
else
    warn "API health check failed. Check logs with: sudo journalctl -u ${APP_NAME} -f"
fi

echo ""
info "Deployment completed successfully!"
echo ""
echo "Useful commands:"
echo "  View logs:       sudo journalctl -u ${APP_NAME} -f"
echo "  Check status:    sudo systemctl status ${APP_NAME}"
echo "  Restart service: sudo systemctl restart ${APP_NAME}"
echo "  Stop service:    sudo systemctl stop ${APP_NAME}"
echo ""
echo "Next steps:"
echo "  1. Configure nginx reverse proxy (see docs/DEPLOYMENT.md)"
echo "  2. Set up SSL with Let's Encrypt (see docs/DEPLOYMENT.md)"
echo ""
