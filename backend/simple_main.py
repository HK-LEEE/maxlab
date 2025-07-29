"""
Simplified version of main.py for troubleshooting
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import os
import logging
from dotenv import load_dotenv

# Load environment variables
load_dotenv('.env.development')

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Simplified lifespan without database initialization"""
    logger.info("🚀 Starting Max Lab MVP Platform (Simple Mode)...")
    
    # Check environment variables
    database_url = os.getenv('DATABASE_URL')
    logger.info(f"📄 Database URL: {database_url}")
    
    # Skip database initialization for now
    logger.info("⏭️ Skipping database initialization")
    logger.info("✅ Max Lab MVP Platform started successfully (Simple Mode)")
    
    yield
    
    logger.info("👋 Max Lab MVP Platform shutdown complete")

# Create FastAPI app
app = FastAPI(
    title="MAX Lab MVP Platform (Simple)",
    version="1.0.0",
    description="Simplified version for testing",
    lifespan=lifespan
)

# Add CORS middleware
cors_origins = [
    "http://localhost:3000",
    "http://localhost:3007", 
    "http://localhost:3008",
    "http://localhost:3010",
    "http://localhost:5173",
    "http://localhost:8000",
    "http://localhost:8010",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Max Lab MVP Platform (Simple Mode)",
        "version": "1.0.0",
        "status": "running"
    }

@app.get("/api/v1/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "database": "not_connected",
        "timestamp": "2025-07-29T13:47:00Z"
    }

# Simple test endpoint for workspaces
@app.get("/api/v1/workspaces/tree")
async def get_workspace_tree():
    """Simple test endpoint"""
    return {
        "workspaces": [],
        "message": "Database not connected - this is a test response"
    }