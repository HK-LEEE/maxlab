#!/bin/bash
# MaxLab Backend Initial Setup Script

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== MaxLab Backend Initial Setup ===${NC}"
echo ""

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
   echo -e "${RED}Please do not run this script as root${NC}"
   exit 1
fi

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# OS Detection
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$NAME
    VER=$VERSION_ID
else
    echo -e "${RED}Cannot detect OS${NC}"
    exit 1
fi

echo -e "${YELLOW}Detected OS: $OS $VER${NC}"
echo ""

# Install system dependencies
echo -e "${YELLOW}Installing system dependencies...${NC}"

if [[ "$OS" == "Ubuntu" ]] || [[ "$OS" == "Debian"* ]]; then
    sudo apt update
    sudo apt install -y \
        python3 python3-pip python3-venv python3-dev \
        postgresql postgresql-contrib \
        redis-server \
        nginx \
        git curl wget \
        build-essential \
        libpq-dev \
        certbot python3-certbot-nginx \
        unixodbc-dev  # For MSSQL driver
        
elif [[ "$OS" == "CentOS"* ]] || [[ "$OS" == "Red Hat"* ]]; then
    sudo yum update -y
    sudo yum install -y \
        python3 python3-pip python3-devel \
        postgresql postgresql-server postgresql-contrib \
        redis \
        nginx \
        git curl wget \
        gcc gcc-c++ make \
        postgresql-devel \
        certbot python3-certbot-nginx \
        unixODBC-devel  # For MSSQL driver
else
    echo -e "${RED}Unsupported OS: $OS${NC}"
    exit 1
fi

# Create user and group
echo -e "${YELLOW}Creating maxlab user and group...${NC}"
if ! id -u maxlab >/dev/null 2>&1; then
    sudo useradd -m -s /bin/bash maxlab
    echo -e "${GREEN}Created user 'maxlab'${NC}"
else
    echo "User 'maxlab' already exists"
fi

# Create directory structure
echo -e "${YELLOW}Creating directory structure...${NC}"
sudo mkdir -p /opt/maxlab/{backend,backend-dev,venv,venv-dev,backups,logs}
sudo mkdir -p /var/log/maxlab
sudo mkdir -p /var/www/maxlab/{static,media}
sudo mkdir -p /var/www/maxlab-dev/{static,media}
sudo mkdir -p /var/www/letsencrypt

# Set permissions
sudo chown -R maxlab:maxlab /opt/maxlab
sudo chown -R maxlab:maxlab /var/log/maxlab
sudo chown -R maxlab:maxlab /var/www/maxlab
sudo chown -R maxlab:maxlab /var/www/maxlab-dev
sudo chmod 755 /var/log/maxlab

# Setup PostgreSQL
echo -e "${YELLOW}Setting up PostgreSQL...${NC}"
if [[ "$OS" == "CentOS"* ]] || [[ "$OS" == "Red Hat"* ]]; then
    sudo postgresql-setup initdb
fi

sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create database and user (you'll need to adjust password)
sudo -u postgres psql <<EOF
-- Create user if not exists
DO \$\$
BEGIN
   IF NOT EXISTS (SELECT FROM pg_catalog.pg_user WHERE usename = 'maxlab') THEN
      CREATE USER maxlab WITH PASSWORD 'changeme';
   END IF;
END
\$\$;

-- Create database if not exists
SELECT 'CREATE DATABASE max_lab OWNER maxlab'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'max_lab')\\gexec

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE max_lab TO maxlab;
EOF

echo -e "${GREEN}PostgreSQL setup complete${NC}"

# Setup Redis
echo -e "${YELLOW}Setting up Redis...${NC}"
sudo systemctl start redis
sudo systemctl enable redis

# Configure Redis for persistence
sudo tee -a /etc/redis/redis.conf > /dev/null <<EOF

# MaxLab configuration
maxmemory 256mb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
save 60 10000
EOF

sudo systemctl restart redis
echo -e "${GREEN}Redis setup complete${NC}"

# Install MSSQL ODBC Driver (optional)
echo -e "${YELLOW}Installing MSSQL ODBC Driver (optional)...${NC}"
if [[ "$OS" == "Ubuntu" ]]; then
    curl https://packages.microsoft.com/keys/microsoft.asc | sudo apt-key add -
    curl https://packages.microsoft.com/config/ubuntu/$(lsb_release -rs)/prod.list | sudo tee /etc/apt/sources.list.d/mssql-release.list
    sudo apt update
    sudo ACCEPT_EULA=Y apt install -y msodbcsql17
fi

# Setup firewall
echo -e "${YELLOW}Setting up firewall...${NC}"
if command_exists ufw; then
    sudo ufw allow 22/tcp
    sudo ufw allow 80/tcp
    sudo ufw allow 443/tcp
    sudo ufw allow 8010/tcp  # Development only, remove for production
    echo -e "${YELLOW}Firewall rules added (not enabled)${NC}"
elif command_exists firewall-cmd; then
    sudo firewall-cmd --permanent --add-service=ssh
    sudo firewall-cmd --permanent --add-service=http
    sudo firewall-cmd --permanent --add-service=https
    sudo firewall-cmd --permanent --add-port=8010/tcp  # Development only
    sudo firewall-cmd --reload
    echo -e "${GREEN}Firewall configured${NC}"
fi

# Generate secret keys
echo -e "${YELLOW}Generating secret keys...${NC}"
cat > /tmp/generate_keys.py <<EOF
import secrets
import base64

print("# Generated secret keys")
print(f"SECRET_KEY={secrets.token_urlsafe(32)}")
print(f"JWT_SECRET_KEY={secrets.token_urlsafe(32)}")
print(f"CSRF_SECRET_KEY={secrets.token_urlsafe(32)}")
print(f"SESSION_SECRET_KEY={secrets.token_urlsafe(32)}")
print(f"ENCRYPTION_KEY={base64.urlsafe_b64encode(secrets.token_bytes(32)).decode()}")
print(f"WEBSOCKET_TOKEN={secrets.token_urlsafe(24)}")
EOF

python3 /tmp/generate_keys.py > ~/maxlab_keys.txt
rm /tmp/generate_keys.py

echo -e "${GREEN}Secret keys generated and saved to ~/maxlab_keys.txt${NC}"
echo -e "${YELLOW}IMPORTANT: Use these keys in your .env file${NC}"

# Create systemd tmpfiles configuration
echo -e "${YELLOW}Creating systemd tmpfiles configuration...${NC}"
sudo tee /etc/tmpfiles.d/maxlab.conf > /dev/null <<EOF
# MaxLab Backend temporary files
d /run/maxlab 0755 maxlab maxlab -
d /var/log/maxlab 0755 maxlab maxlab -
EOF

# Create logrotate configuration
echo -e "${YELLOW}Creating logrotate configuration...${NC}"
sudo tee /etc/logrotate.d/maxlab > /dev/null <<EOF
/var/log/maxlab/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 0644 maxlab maxlab
    sharedscripts
    postrotate
        systemctl reload maxlab-backend-production >/dev/null 2>&1 || true
        systemctl reload maxlab-backend-development >/dev/null 2>&1 || true
    endscript
}
EOF

# Summary
echo ""
echo -e "${GREEN}=== Setup Complete ===${NC}"
echo ""
echo "Next steps:"
echo "1. Clone your repository to /opt/maxlab/backend"
echo "   sudo -u maxlab git clone <your-repo> /opt/maxlab/backend"
echo ""
echo "2. Copy and configure environment files:"
echo "   cd /opt/maxlab/backend"
echo "   sudo -u maxlab cp .env.production.template .env"
echo "   sudo -u maxlab nano .env  # Add your configuration"
echo ""
echo "3. Use the secret keys from ~/maxlab_keys.txt"
echo ""
echo "4. Run the deployment script:"
echo "   cd /opt/maxlab/backend"
echo "   sudo ./scripts/deploy.sh production"
echo ""
echo "5. Setup SSL certificates:"
echo "   See SSL_CERTIFICATE_SETUP.md for instructions"
echo ""
echo "6. Configure DNS:"
echo "   - Point maxlab.chem.co.kr to this server"
echo "   - Point devmaxlab.chem.co.kr to this server"
echo ""
echo -e "${YELLOW}Security Notes:${NC}"
echo "- Change the PostgreSQL password for 'maxlab' user"
echo "- Review and enable firewall rules"
echo "- Configure fail2ban for additional security"
echo "- Setup monitoring and alerting"
echo ""
echo -e "${GREEN}Good luck with your deployment!${NC}"