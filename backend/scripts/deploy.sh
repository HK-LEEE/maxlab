#!/bin/bash
# MaxLab Backend Deployment Script

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT=${1:-production}
PROJECT_DIR="/opt/maxlab/backend"
VENV_DIR="/opt/maxlab/venv"
BACKUP_DIR="/opt/maxlab/backups"
LOG_DIR="/var/log/maxlab"
USER="maxlab"
GROUP="maxlab"

# Validate environment
if [[ "$ENVIRONMENT" != "production" && "$ENVIRONMENT" != "development" ]]; then
    echo -e "${RED}Error: Invalid environment. Use 'production' or 'development'${NC}"
    exit 1
fi

echo -e "${GREEN}=== MaxLab Backend Deployment ===${NC}"
echo -e "Environment: ${YELLOW}$ENVIRONMENT${NC}"
echo ""

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Pre-deployment checks
echo -e "${YELLOW}Running pre-deployment checks...${NC}"

if ! command_exists git; then
    echo -e "${RED}Error: git is not installed${NC}"
    exit 1
fi

if ! command_exists python3; then
    echo -e "${RED}Error: python3 is not installed${NC}"
    exit 1
fi

if ! command_exists nginx; then
    echo -e "${RED}Error: nginx is not installed${NC}"
    exit 1
fi

if ! command_exists redis-cli; then
    echo -e "${RED}Error: redis is not installed${NC}"
    exit 1
fi

# Create directories if they don't exist
echo -e "${YELLOW}Creating directories...${NC}"
sudo mkdir -p $PROJECT_DIR
sudo mkdir -p $VENV_DIR
sudo mkdir -p $BACKUP_DIR
sudo mkdir -p $LOG_DIR
sudo mkdir -p /var/www/maxlab/static
sudo mkdir -p /var/www/maxlab/media

# Set ownership
sudo chown -R $USER:$GROUP $PROJECT_DIR
sudo chown -R $USER:$GROUP $VENV_DIR
sudo chown -R $USER:$GROUP $BACKUP_DIR
sudo chown -R $USER:$GROUP $LOG_DIR
sudo chown -R $USER:$GROUP /var/www/maxlab

# Backup current deployment
if [ -d "$PROJECT_DIR/.git" ]; then
    echo -e "${YELLOW}Backing up current deployment...${NC}"
    BACKUP_NAME="backup_$(date +%Y%m%d_%H%M%S).tar.gz"
    sudo -u $USER tar -czf "$BACKUP_DIR/$BACKUP_NAME" -C $PROJECT_DIR . --exclude='.env' --exclude='__pycache__'
    echo -e "${GREEN}Backup created: $BACKUP_NAME${NC}"
fi

# Pull latest code
echo -e "${YELLOW}Pulling latest code...${NC}"
cd $PROJECT_DIR
sudo -u $USER git pull origin main

# Copy environment file
echo -e "${YELLOW}Setting up environment file...${NC}"
if [ "$ENVIRONMENT" = "production" ]; then
    if [ ! -f "$PROJECT_DIR/.env" ]; then
        echo -e "${RED}Error: .env file not found for production${NC}"
        echo "Please create .env from .env.production.template"
        exit 1
    fi
else
    # Development
    if [ ! -f "$PROJECT_DIR/.env" ]; then
        sudo -u $USER cp .env.development .env
        echo -e "${YELLOW}Copied .env.development to .env${NC}"
    fi
fi

# Create/update virtual environment
echo -e "${YELLOW}Setting up Python virtual environment...${NC}"
if [ ! -d "$VENV_DIR" ]; then
    sudo -u $USER python3 -m venv $VENV_DIR
fi

# Activate virtual environment and install dependencies
echo -e "${YELLOW}Installing Python dependencies...${NC}"
sudo -u $USER $VENV_DIR/bin/pip install --upgrade pip setuptools wheel
sudo -u $USER $VENV_DIR/bin/pip install -r requirements.txt

# Run database migrations
echo -e "${YELLOW}Running database migrations...${NC}"
sudo -u $USER $VENV_DIR/bin/python -m alembic upgrade head

# Collect static files (if applicable)
# echo -e "${YELLOW}Collecting static files...${NC}"
# sudo -u $USER $VENV_DIR/bin/python manage.py collectstatic --noinput

# Setup Nginx
echo -e "${YELLOW}Setting up Nginx...${NC}"
if [ "$ENVIRONMENT" = "production" ]; then
    sudo cp nginx/sites-available/maxlab-production.conf /etc/nginx/sites-available/
    sudo ln -sf /etc/nginx/sites-available/maxlab-production.conf /etc/nginx/sites-enabled/
else
    sudo cp nginx/sites-available/maxlab-development.conf /etc/nginx/sites-available/
    sudo ln -sf /etc/nginx/sites-available/maxlab-development.conf /etc/nginx/sites-enabled/
fi

# Test Nginx configuration
sudo nginx -t

# Setup systemd services
echo -e "${YELLOW}Setting up systemd services...${NC}"
if [ "$ENVIRONMENT" = "production" ]; then
    sudo cp systemd/maxlab-backend-production.service /etc/systemd/system/
    sudo cp systemd/maxlab-backend-production-2.service /etc/systemd/system/
    sudo systemctl daemon-reload
    sudo systemctl enable maxlab-backend-production.service
    sudo systemctl enable maxlab-backend-production-2.service
else
    sudo cp systemd/maxlab-backend-development.service /etc/systemd/system/
    sudo systemctl daemon-reload
    sudo systemctl enable maxlab-backend-development.service
fi

# Restart services
echo -e "${YELLOW}Restarting services...${NC}"
if [ "$ENVIRONMENT" = "production" ]; then
    sudo systemctl restart maxlab-backend-production.service
    sudo systemctl restart maxlab-backend-production-2.service
    
    # Wait for services to start
    sleep 5
    
    # Check service status
    if sudo systemctl is-active --quiet maxlab-backend-production.service; then
        echo -e "${GREEN}Production service 1 is running${NC}"
    else
        echo -e "${RED}Production service 1 failed to start${NC}"
        sudo journalctl -u maxlab-backend-production.service -n 50
    fi
    
    if sudo systemctl is-active --quiet maxlab-backend-production-2.service; then
        echo -e "${GREEN}Production service 2 is running${NC}"
    else
        echo -e "${RED}Production service 2 failed to start${NC}"
        sudo journalctl -u maxlab-backend-production-2.service -n 50
    fi
else
    sudo systemctl restart maxlab-backend-development.service
    
    # Wait for service to start
    sleep 5
    
    # Check service status
    if sudo systemctl is-active --quiet maxlab-backend-development.service; then
        echo -e "${GREEN}Development service is running${NC}"
    else
        echo -e "${RED}Development service failed to start${NC}"
        sudo journalctl -u maxlab-backend-development.service -n 50
    fi
fi

# Reload Nginx
sudo systemctl reload nginx

# Run health check
echo -e "${YELLOW}Running health check...${NC}"
sleep 3

if [ "$ENVIRONMENT" = "production" ]; then
    HEALTH_URL="https://maxlab.chem.co.kr/health"
else
    HEALTH_URL="https://devmaxlab.chem.co.kr/health"
fi

if curl -k -f -s "$HEALTH_URL" > /dev/null; then
    echo -e "${GREEN}Health check passed!${NC}"
else
    echo -e "${RED}Health check failed!${NC}"
    echo "Please check the logs for more information"
fi

echo ""
echo -e "${GREEN}=== Deployment Complete ===${NC}"
echo ""
echo "Next steps:"
echo "1. Verify the application at:"
if [ "$ENVIRONMENT" = "production" ]; then
    echo "   https://maxlab.chem.co.kr"
else
    echo "   https://devmaxlab.chem.co.kr"
fi
echo "2. Monitor logs:"
echo "   sudo journalctl -f -u maxlab-backend-$ENVIRONMENT"
echo "   sudo tail -f /var/log/maxlab/*.log"
echo "3. Check metrics (if enabled):"
echo "   http://localhost:9090/metrics"