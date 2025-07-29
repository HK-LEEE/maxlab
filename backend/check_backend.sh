#!/bin/bash
# Check which backend is running on port 8010

echo "🔍 Checking backend process on port 8010..."

# Find process
PID=$(lsof -ti :8010)

if [ -z "$PID" ]; then
    echo "❌ No process found running on port 8010"
    exit 1
fi

echo "✅ Found process: PID $PID"

# Check working directory
WORK_DIR=$(pwdx $PID | cut -d' ' -f2)
echo "📁 Working directory: $WORK_DIR"

# Check if it's the correct directory
if [[ "$WORK_DIR" == "/home/lee/proejct/maxlab/backend" ]]; then
    echo "✅ Backend is running from the CORRECT directory"
else
    echo "❌ Backend is running from WRONG directory!"
    echo "   Expected: /home/lee/proejct/maxlab/backend"
    echo "   Actual:   $WORK_DIR"
    echo ""
    echo "To fix: kill $PID && cd /home/lee/proejct/maxlab/backend && ./start_backend.sh"
fi