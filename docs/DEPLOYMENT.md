# Production Deployment Guide

This guide covers deploying the Context Evaluator API server to a Linux production server with HTTPS enabled via Let's Encrypt and nginx.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Step 1: Build the Binary](#step-1-build-the-binary)
- [Step 2: Deploy to Server](#step-2-deploy-to-server)
- [Step 3: Configure Nginx Reverse Proxy](#step-3-configure-nginx-reverse-proxy)
- [Step 4: Set Up SSL with Let's Encrypt](#step-4-set-up-ssl-with-lets-encrypt)
- [Step 5: Verify Deployment](#step-5-verify-deployment)
- [Management Commands](#management-commands)
- [Troubleshooting](#troubleshooting)
- [Security Considerations](#security-considerations)

---

## Prerequisites

### On Your Local Machine

- Node.js and Bun installed
- SSH access to your Linux server
- Domain name configured (e.g., `your-domain.com`)

### On Your Linux Server

- Ubuntu 20.04+ or Debian 11+ (or equivalent)
- Root or sudo access
- Port 80 and 443 open in firewall
- Domain DNS A record pointing to server IP

### Required Packages on Server

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx curl
```

---

## Step 1: Build the Binary

On your local machine, build the production binary:

```bash
# Install dependencies
bun install

# Build production binaries
bun run build:prod
```

This creates `dist/bin/context-evaluator-linux-x64`.

---

## Step 2: Deploy to Server

### Option A: Using the Deployment Script (Recommended)

1. **Copy files to server:**

```bash
# Copy binary and deployment script
scp dist/bin/context-evaluator-linux-x64 user@your-server:/tmp/
scp scripts/deploy/deploy-server.sh user@your-server:/tmp/
```

2. **Run deployment script on server:**

```bash
ssh user@your-server

# Navigate to the temporary directory
cd /tmp

# Create a directory structure
mkdir -p deploy-context-evaluator/dist/bin
mv context-evaluator-linux-x64 deploy-context-evaluator/dist/bin/
mv deploy-server.sh deploy-context-evaluator/

# Run the deployment script
cd deploy-context-evaluator
sudo bash deploy-server.sh
```

The script will:
- Install the binary to `/opt/context-evaluator/`
- Create a systemd service
- Enable and start the service
- Verify it's running

3. **Verify service is running:**

```bash
sudo systemctl status context-evaluator
curl http://127.0.0.1:3001/api/health
```

### Option B: Manual Deployment

If you prefer manual steps, see [Manual Deployment](#manual-deployment-alternative) at the bottom of this document.

---

## Step 3: Configure Nginx Reverse Proxy

### Create Nginx Configuration

Create `/etc/nginx/sites-available/context-evaluator`:

```nginx
# HTTP server - will redirect to HTTPS after SSL setup
server {
    listen 80;
    listen [::]:80;
    server_name your-domain.com www.your-domain.com;

    # Let's Encrypt ACME challenge
    location ^~ /.well-known/acme-challenge/ {
        allow all;
        root /var/www/certbot;
        default_type "text/plain";
    }

    # Health check (allow HTTP for monitoring)
    location = /api/health {
        proxy_pass http://127.0.0.1:3001;
    }

    # Redirect all other traffic to HTTPS (after SSL is set up)
    location / {
        return 301 https://$server_name$request_uri;
    }
}

# HTTPS server - will be configured by certbot
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name your-domain.com www.your-domain.com;

    # SSL certificates (will be added by certbot)
    # ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Client body size limit (for file uploads)
    client_max_body_size 100M;

    # Proxy settings
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;

        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';

        # Standard proxy headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port $server_port;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;

        # Disable buffering for SSE (Server-Sent Events)
        proxy_buffering off;
        proxy_cache_bypass $http_upgrade;
    }

    # Access and error logs
    access_log /var/log/nginx/context-evaluator.access.log;
    error_log /var/log/nginx/context-evaluator.error.log;
}
```

### Enable the Site

```bash
# Create certbot webroot directory
sudo mkdir -p /var/www/certbot

# Test nginx configuration
sudo nginx -t

# Enable the site
sudo ln -s /etc/nginx/sites-available/context-evaluator /etc/nginx/sites-enabled/

# Reload nginx
sudo systemctl reload nginx
```

---

## Step 4: Set Up SSL with Let's Encrypt

### Verify DNS Configuration

Before running certbot, ensure your domain's DNS A record points to your server:

```bash
# Check DNS resolution
dig +short your-domain.com

# Should return your server's IP address
```

### Obtain SSL Certificate

Use certbot to obtain and configure SSL certificates:

```bash
# Run certbot with nginx plugin
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# Follow the prompts:
# 1. Enter your email address (for renewal notifications)
# 2. Agree to Terms of Service
# 3. Choose whether to redirect HTTP to HTTPS (recommended: yes)
```

Certbot will:
- Obtain certificates from Let's Encrypt
- Automatically update your nginx configuration
- Set up HTTPS redirect
- Configure SSL settings

### Test SSL Configuration

```bash
# Test with curl
curl -I https://your-domain.com/api/health

# Should return 200 OK with HTTPS
```

### Set Up Auto-Renewal

Certbot automatically installs a systemd timer for certificate renewal. Verify it's enabled:

```bash
# Check renewal timer status
sudo systemctl status certbot.timer

# Test renewal process (dry run)
sudo certbot renew --dry-run
```

Certificates will automatically renew when they're 30 days from expiration.

---

## Step 5: Verify Deployment

### Test API Endpoints

```bash
# Health check
curl https://your-domain.com/api/health

# Expected response:
# {"status":"healthy","timestamp":"2026-01-28T..."}

# List evaluators
curl https://your-domain.com/api/evaluators

# Expected: JSON array of evaluator objects
```

### Test SSL Security

Use SSL Labs to test your SSL configuration:

https://www.ssllabs.com/ssltest/analyze.html?d=your-domain.com

Aim for an A+ rating.

### Test Frontend

Open in browser:
https://your-domain.com

The frontend should load and be fully functional.

---

## Management Commands

### Service Management

```bash
# Check service status
sudo systemctl status context-evaluator

# View real-time logs
sudo journalctl -u context-evaluator -f

# View last 100 log lines
sudo journalctl -u context-evaluator -n 100 --no-pager

# Restart service
sudo systemctl restart context-evaluator

# Stop service
sudo systemctl stop context-evaluator

# Start service
sudo systemctl start context-evaluator

# Disable service (won't start on boot)
sudo systemctl disable context-evaluator

# Enable service (start on boot)
sudo systemctl enable context-evaluator
```

### Nginx Management

```bash
# Test nginx configuration
sudo nginx -t

# Reload nginx (graceful, no downtime)
sudo systemctl reload nginx

# Restart nginx
sudo systemctl restart nginx

# View nginx error logs
sudo tail -f /var/log/nginx/context-evaluator.error.log

# View nginx access logs
sudo tail -f /var/log/nginx/context-evaluator.access.log
```

### SSL Certificate Management

```bash
# Check certificate status
sudo certbot certificates

# Manually renew certificates
sudo certbot renew

# Test renewal (dry run)
sudo certbot renew --dry-run

# Revoke certificate
sudo certbot revoke --cert-path /etc/letsencrypt/live/your-domain.com/cert.pem
```

---

## Troubleshooting

### Service Won't Start

1. **Check service logs:**
   ```bash
   sudo journalctl -u context-evaluator -n 50 --no-pager
   ```

2. **Check if port is already in use:**
   ```bash
   sudo lsof -i :3001
   ```

3. **Verify binary has execute permissions:**
   ```bash
   ls -la /opt/context-evaluator/context-evaluator-linux-x64
   ```

4. **Test binary manually:**
   ```bash
   sudo -u www-data /opt/context-evaluator/context-evaluator-linux-x64 api --host 127.0.0.1 --port 3001
   ```

### SSL Certificate Issues

1. **Check nginx error logs:**
   ```bash
   sudo tail -f /var/log/nginx/error.log
   ```

2. **Verify DNS is correct:**
   ```bash
   dig +short your-domain.com
   nslookup your-domain.com
   ```

3. **Check certbot logs:**
   ```bash
   sudo tail -f /var/log/letsencrypt/letsencrypt.log
   ```

4. **Ensure ports 80 and 443 are open:**
   ```bash
   sudo ufw status
   sudo netstat -tlnp | grep -E ':(80|443)'
   ```

### Nginx 502 Bad Gateway

This usually means the backend service isn't running or isn't reachable.

1. **Check if service is running:**
   ```bash
   sudo systemctl status context-evaluator
   curl http://127.0.0.1:3001/api/health
   ```

2. **Check nginx error log:**
   ```bash
   sudo tail -f /var/log/nginx/context-evaluator.error.log
   ```

3. **Verify proxy_pass address matches service:**
   ```bash
   grep proxy_pass /etc/nginx/sites-available/context-evaluator
   ```

### High Memory Usage

If the service uses too much memory:

1. **Check current memory usage:**
   ```bash
   ps aux | grep context-evaluator
   ```

2. **Add memory limits to systemd service:**

   Edit `/etc/systemd/system/context-evaluator.service`:
   ```ini
   [Service]
   MemoryMax=2G
   MemoryHigh=1.5G
   ```

3. **Reload and restart:**
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl restart context-evaluator
   ```

### Firewall Configuration

If you're using UFW:

```bash
# Allow HTTP and HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Allow SSH (if not already allowed)
sudo ufw allow 22/tcp

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status verbose
```

---

## Security Considerations

### Application Security

1. **Service runs as unprivileged user** (`www-data`)
2. **Systemd security hardening** enabled:
   - `NoNewPrivileges=true`
   - `PrivateTmp=true`
   - `ProtectSystem=strict`
   - `ProtectHome=true`

3. **Binds to localhost only** - external access only via nginx proxy

### Nginx Security

1. **HTTPS enforced** with automatic redirect from HTTP
2. **Security headers** configured:
   - Strict-Transport-Security (HSTS)
   - X-Frame-Options
   - X-Content-Type-Options
   - X-XSS-Protection

3. **Modern TLS configuration** (TLSv1.2 and TLSv1.3 only)

### Firewall

Only expose necessary ports:
- Port 22 (SSH) - restrict to specific IPs if possible
- Port 80 (HTTP) - for Let's Encrypt challenges and redirects
- Port 443 (HTTPS) - for production traffic

### Updates

Keep your system and dependencies updated:

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Check for certbot updates
sudo apt install --only-upgrade certbot python3-certbot-nginx
```

### Monitoring

Consider setting up monitoring for:
- Service uptime (systemd status)
- SSL certificate expiration (certbot hooks)
- Nginx error logs
- Application logs
- Server resource usage (CPU, memory, disk)

### Backup

Regular backups of:
- `/opt/context-evaluator/` (application)
- `/etc/nginx/sites-available/` (nginx config)
- `/etc/letsencrypt/` (SSL certificates)
- `/etc/systemd/system/context-evaluator.service` (service file)

---

## Manual Deployment (Alternative)

If you prefer not to use the deployment script:

### 1. Install Binary

```bash
# Create directory
sudo mkdir -p /opt/context-evaluator

# Copy binary
sudo cp context-evaluator-linux-x64 /opt/context-evaluator/
sudo chmod +x /opt/context-evaluator/context-evaluator-linux-x64

# Set ownership
sudo chown -R www-data:www-data /opt/context-evaluator
```

### 2. Create Systemd Service

Create `/etc/systemd/system/context-evaluator.service`:

```ini
[Unit]
Description=Context Evaluator API Server
After=network.target
Documentation=https://github.com/anthropics/agents-md-evaluator

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/context-evaluator
Environment="HOST=127.0.0.1"
Environment="PORT=3001"
Environment="NODE_ENV=production"
ExecStart=/opt/context-evaluator/context-evaluator-linux-x64 api --host 127.0.0.1 --port 3001
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=context-evaluator

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/context-evaluator

[Install]
WantedBy=multi-user.target
```

### 3. Enable and Start

```bash
sudo systemctl daemon-reload
sudo systemctl enable context-evaluator
sudo systemctl start context-evaluator
sudo systemctl status context-evaluator
```

---

## Quick Reference

```bash
# Deploy new version
scp dist/bin/context-evaluator-linux-x64 server:/tmp/
ssh server "sudo cp /tmp/context-evaluator-linux-x64 /opt/context-evaluator/ && sudo systemctl restart context-evaluator"

# View logs
sudo journalctl -u context-evaluator -f

# Test API
curl https://your-domain.com/api/health

# Reload nginx config
sudo nginx -t && sudo systemctl reload nginx

# Check SSL certificate
sudo certbot certificates

# Renew SSL certificate
sudo certbot renew
```

---

## Additional Resources

- [Let's Encrypt Documentation](https://letsencrypt.org/docs/)
- [Nginx Documentation](https://nginx.org/en/docs/)
- [Systemd Service Documentation](https://www.freedesktop.org/software/systemd/man/systemd.service.html)
- [UFW Firewall Guide](https://help.ubuntu.com/community/UFW)
