#!/bin/bash
# MaxLab Backend Service Management Script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT=${2:-production}
ACTION=$1

# Services
if [ "$ENVIRONMENT" = "production" ]; then
    SERVICES=("maxlab-backend-production" "maxlab-backend-production-2")
else
    SERVICES=("maxlab-backend-development")
fi

# Functions
show_help() {
    echo "MaxLab Backend Service Manager"
    echo ""
    echo "Usage: $0 <action> [environment]"
    echo ""
    echo "Actions:"
    echo "  start       - Start all services"
    echo "  stop        - Stop all services"
    echo "  restart     - Restart all services"
    echo "  reload      - Reload all services (graceful)"
    echo "  status      - Show service status"
    echo "  logs        - Show service logs"
    echo "  health      - Run health checks"
    echo "  metrics     - Show metrics"
    echo ""
    echo "Environment:"
    echo "  production  - Production environment (default)"
    echo "  development - Development environment"
    echo ""
    echo "Examples:"
    echo "  $0 start production"
    echo "  $0 logs development"
    echo "  $0 status"
}

check_service_status() {
    local service=$1
    if sudo systemctl is-active --quiet $service; then
        echo -e "${GREEN}✓${NC} $service is running"
        sudo systemctl status $service --no-pager | grep -E "Active:|Main PID:" | sed 's/^/    /'
    else
        echo -e "${RED}✗${NC} $service is not running"
    fi
}

show_service_logs() {
    local service=$1
    echo -e "${BLUE}=== Logs for $service ===${NC}"
    sudo journalctl -u $service -n 100 --no-pager
}

run_health_check() {
    local port=$1
    local name=$2
    echo -n "Checking $name (port $port)... "
    
    if curl -f -s "http://localhost:$port/api/health" > /dev/null; then
        echo -e "${GREEN}✓ Healthy${NC}"
        curl -s "http://localhost:$port/api/health" | python3 -m json.tool | head -10
    else
        echo -e "${RED}✗ Unhealthy${NC}"
    fi
}

# Validate action
if [ -z "$ACTION" ]; then
    show_help
    exit 1
fi

# Main logic
case $ACTION in
    start)
        echo -e "${YELLOW}Starting MaxLab Backend services ($ENVIRONMENT)...${NC}"
        for service in "${SERVICES[@]}"; do
            echo -n "Starting $service... "
            sudo systemctl start $service
            echo -e "${GREEN}Done${NC}"
        done
        
        # Also start nginx if not running
        if ! sudo systemctl is-active --quiet nginx; then
            echo -n "Starting nginx... "
            sudo systemctl start nginx
            echo -e "${GREEN}Done${NC}"
        fi
        ;;
        
    stop)
        echo -e "${YELLOW}Stopping MaxLab Backend services ($ENVIRONMENT)...${NC}"
        for service in "${SERVICES[@]}"; do
            echo -n "Stopping $service... "
            sudo systemctl stop $service
            echo -e "${GREEN}Done${NC}"
        done
        ;;
        
    restart)
        echo -e "${YELLOW}Restarting MaxLab Backend services ($ENVIRONMENT)...${NC}"
        for service in "${SERVICES[@]}"; do
            echo -n "Restarting $service... "
            sudo systemctl restart $service
            echo -e "${GREEN}Done${NC}"
        done
        
        # Reload nginx
        echo -n "Reloading nginx... "
        sudo systemctl reload nginx
        echo -e "${GREEN}Done${NC}"
        ;;
        
    reload)
        echo -e "${YELLOW}Reloading MaxLab Backend services ($ENVIRONMENT)...${NC}"
        for service in "${SERVICES[@]}"; do
            echo -n "Reloading $service... "
            sudo systemctl reload $service 2>/dev/null || sudo systemctl restart $service
            echo -e "${GREEN}Done${NC}"
        done
        ;;
        
    status)
        echo -e "${BLUE}=== MaxLab Backend Service Status ($ENVIRONMENT) ===${NC}"
        echo ""
        
        # Check services
        for service in "${SERVICES[@]}"; do
            check_service_status $service
            echo ""
        done
        
        # Check nginx
        echo -e "${BLUE}=== Nginx Status ===${NC}"
        check_service_status nginx
        echo ""
        
        # Check Redis
        echo -e "${BLUE}=== Redis Status ===${NC}"
        check_service_status redis
        echo ""
        
        # Check PostgreSQL
        echo -e "${BLUE}=== PostgreSQL Status ===${NC}"
        check_service_status postgresql
        ;;
        
    logs)
        echo -e "${BLUE}=== MaxLab Backend Logs ($ENVIRONMENT) ===${NC}"
        
        # Show logs for each service
        for service in "${SERVICES[@]}"; do
            show_service_logs $service
            echo ""
        done
        
        # Follow logs if -f flag is provided
        if [ "$3" = "-f" ]; then
            echo -e "${YELLOW}Following logs (Ctrl+C to exit)...${NC}"
            sudo journalctl -f -u ${SERVICES[0]}
        fi
        ;;
        
    health)
        echo -e "${BLUE}=== Health Checks ($ENVIRONMENT) ===${NC}"
        echo ""
        
        if [ "$ENVIRONMENT" = "production" ]; then
            run_health_check 8010 "Production Instance 1"
            echo ""
            run_health_check 8011 "Production Instance 2"
        else
            run_health_check 8010 "Development Instance"
        fi
        
        echo ""
        echo -e "${BLUE}=== External Health Check ===${NC}"
        if [ "$ENVIRONMENT" = "production" ]; then
            URL="https://maxlab.chem.co.kr/health"
        else
            URL="https://devmaxlab.chem.co.kr/health"
        fi
        
        echo -n "Checking $URL... "
        if curl -k -f -s "$URL" > /dev/null; then
            echo -e "${GREEN}✓ Accessible${NC}"
        else
            echo -e "${RED}✗ Not accessible${NC}"
        fi
        ;;
        
    metrics)
        echo -e "${BLUE}=== Metrics ($ENVIRONMENT) ===${NC}"
        echo ""
        
        if [ "$ENVIRONMENT" = "production" ]; then
            METRICS_PORT=9090
        else
            METRICS_PORT=9091
        fi
        
        echo "Fetching metrics from port $METRICS_PORT..."
        curl -s "http://localhost:$METRICS_PORT/metrics" | head -50
        echo ""
        echo "... (truncated)"
        echo ""
        echo "Full metrics available at: http://localhost:$METRICS_PORT/metrics"
        ;;
        
    *)
        echo -e "${RED}Error: Invalid action '$ACTION'${NC}"
        echo ""
        show_help
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}Operation completed successfully!${NC}"