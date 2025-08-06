#!/bin/bash

# OAuth Production Fix Deployment Script
# This script fixes the OAuth callback 404 issue in production

set -e

echo "========================================="
echo "MaxLab OAuth Production Fix Deployment"
echo "========================================="

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then 
    echo "Please run this script with sudo"
    exit 1
fi

# Variables
NGINX_SITES_AVAILABLE="/etc/nginx/sites-available"
NGINX_SITES_ENABLED="/etc/nginx/sites-enabled"
NGINX_CONFIG_NAME="maxlab"
FRONTEND_BUILD_PATH="/var/www/maxlab/frontend/dist"
BACKEND_PATH="/opt/maxlab/backend"

echo ""
echo "Step 1: Backing up current nginx configuration..."
if [ -f "$NGINX_SITES_AVAILABLE/$NGINX_CONFIG_NAME" ]; then
    cp "$NGINX_SITES_AVAILABLE/$NGINX_CONFIG_NAME" "$NGINX_SITES_AVAILABLE/${NGINX_CONFIG_NAME}.backup.$(date +%Y%m%d_%H%M%S)"
    echo "✓ Nginx config backed up"
else
    echo "⚠ No existing nginx config found"
fi

echo ""
echo "Step 2: Deploying new nginx configuration..."
cp nginx.production.conf "$NGINX_SITES_AVAILABLE/$NGINX_CONFIG_NAME"
echo "✓ New nginx config deployed"

echo ""
echo "Step 3: Enabling nginx site..."
if [ ! -L "$NGINX_SITES_ENABLED/$NGINX_CONFIG_NAME" ]; then
    ln -s "$NGINX_SITES_AVAILABLE/$NGINX_CONFIG_NAME" "$NGINX_SITES_ENABLED/$NGINX_CONFIG_NAME"
    echo "✓ Site enabled"
else
    echo "✓ Site already enabled"
fi

echo ""
echo "Step 4: Testing nginx configuration..."
nginx -t
if [ $? -eq 0 ]; then
    echo "✓ Nginx configuration is valid"
else
    echo "✗ Nginx configuration test failed"
    echo "Rolling back..."
    if [ -f "$NGINX_SITES_AVAILABLE/${NGINX_CONFIG_NAME}.backup.*" ]; then
        mv "$NGINX_SITES_AVAILABLE/${NGINX_CONFIG_NAME}.backup."* "$NGINX_SITES_AVAILABLE/$NGINX_CONFIG_NAME"
    fi
    exit 1
fi

echo ""
echo "Step 5: Building frontend (if needed)..."
if [ ! -d "$FRONTEND_BUILD_PATH" ]; then
    echo "Frontend build not found. Please build the frontend first:"
    echo "  cd frontend && npm install && npm run build"
    echo "  Then copy the build to $FRONTEND_BUILD_PATH"
else
    echo "✓ Frontend build exists at $FRONTEND_BUILD_PATH"
fi

echo ""
echo "Step 6: Restarting services..."
echo "Reloading nginx..."
systemctl reload nginx
echo "✓ Nginx reloaded"

echo "Restarting backend service (if using systemd)..."
if systemctl is-active --quiet maxlab-backend; then
    systemctl restart maxlab-backend
    echo "✓ Backend service restarted"
else
    echo "⚠ Backend service not found or not running"
    echo "  Please restart the backend manually if needed"
fi

echo ""
echo "Step 7: Verifying OAuth callback route..."
# Test if the OAuth callback route returns the HTML page (not 404)
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" https://maxlab.dwchem.co.kr/oauth/callback)
if [ "$RESPONSE" = "200" ]; then
    echo "✓ OAuth callback route is accessible (HTTP $RESPONSE)"
else
    echo "⚠ OAuth callback route returned HTTP $RESPONSE"
    echo "  This might be normal if SSL certificates are not yet configured"
fi

echo ""
echo "========================================="
echo "Deployment Complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. Ensure SSL certificates are properly configured"
echo "2. Update OAuth provider settings with the callback URL:"
echo "   https://maxlab.dwchem.co.kr/oauth/callback"
echo "3. Test the OAuth login flow in production"
echo ""
echo "If you encounter issues:"
echo "- Check nginx logs: tail -f /var/log/nginx/maxlab.error.log"
echo "- Check backend logs: journalctl -u maxlab-backend -f"
echo "- Restore nginx config: mv $NGINX_SITES_AVAILABLE/${NGINX_CONFIG_NAME}.backup.* $NGINX_SITES_AVAILABLE/$NGINX_CONFIG_NAME"