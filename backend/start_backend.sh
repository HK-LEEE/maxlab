#!/bin/bash
# MAX Lab Backend Startup Script
# This ensures the backend always starts from the correct directory

BACKEND_DIR="/home/lee/proejct/maxlab/backend"

# Check if we're in the correct directory
if [ "$(pwd)" != "$BACKEND_DIR" ]; then
    echo "✅ Changing to correct backend directory: $BACKEND_DIR"
    cd "$BACKEND_DIR" || exit 1
fi

# Load environment variables
if [ -f ".env.development" ]; then
    echo "✅ Loading environment from .env.development"
    export $(grep -v '^#' .env.development | xargs)
fi

# Activate virtual environment if it exists
if [ -f ".venv/bin/activate" ]; then
    echo "✅ Activating virtual environment"
    source .venv/bin/activate
fi

# Test database connection first
echo "🔗 Testing database connection..."
python test_db_connection.py || {
    echo "❌ Database connection failed"
    exit 1
}

# Start the backend server
echo "🚀 Starting MAX Lab Backend on port 8010..."
echo "📁 Working directory: $(pwd)"
echo "🗃️ Database URL: $DATABASE_URL"
PYTHONPATH="$(pwd)" uvicorn app.main:app --reload --port 8010 --host 0.0.0.0