#!/usr/bin/env python3
"""Script to fix common setup issues"""

import os
import sys
import subprocess

def check_python_version():
    """Check if Python version is 3.11 or higher"""
    version = sys.version_info
    if version.major < 3 or (version.major == 3 and version.minor < 11):
        print(f"❌ Python {version.major}.{version.minor} detected. Python 3.11+ required.")
        return False
    print(f"✓ Python {version.major}.{version.minor} detected")
    return True

def check_venv():
    """Check if running in virtual environment"""
    if not hasattr(sys, 'real_prefix') and not (hasattr(sys, 'base_prefix') and sys.base_prefix != sys.prefix):
        print("⚠️  Not running in virtual environment")
        print("   Run: python3 -m venv venv && source venv/bin/activate")
        return False
    print("✓ Virtual environment active")
    return True

def check_env_file():
    """Check if .env file exists and is configured"""
    if not os.path.exists('.env'):
        print("❌ .env file not found")
        if os.path.exists('.env.example'):
            print("   Creating .env from .env.example...")
            import shutil
            shutil.copy('.env.example', '.env')
            print("   ✓ .env created. Please edit it with your configuration.")
        return False
    
    # Check for default values
    with open('.env', 'r') as f:
        content = f.read()
        if 'your-secret-key-here' in content or 'same-secret-key-as-maxplatform' in content:
            print("⚠️  .env contains default values. Please update:")
            print("   - JWT_SECRET_KEY (must match maxplatform)")
            print("   - SECRET_KEY (generate with: python3 -c \"import secrets; print(secrets.token_urlsafe(32))\")")
            print("   - DATABASE_URL (update with your database credentials)")
            return False
    
    print("✓ .env file exists")
    return True

def install_requirements():
    """Install missing requirements"""
    print("\nInstalling requirements...")
    try:
        subprocess.run([sys.executable, '-m', 'pip', 'install', '-r', 'requirements.txt'], check=True)
        print("✓ Requirements installed")
        return True
    except subprocess.CalledProcessError:
        print("❌ Failed to install requirements")
        return False

def test_database_connection():
    """Test database connection"""
    try:
        from app.core.config import settings
        from sqlalchemy import create_engine, text
        
        # Convert async URL to sync for testing
        db_url = settings.DATABASE_URL.replace('+aiomysql', '+pymysql').replace('+asyncpg', '')
        
        print(f"\nTesting database connection...")
        print(f"  URL: {db_url.split('@')[1]}")  # Hide password
        
        engine = create_engine(db_url)
        with engine.connect() as conn:
            result = conn.execute(text("SELECT 1"))
            result.fetchone()
        
        print("✓ Database connection successful")
        return True
        
    except Exception as e:
        print(f"❌ Database connection failed: {e}")
        print("\n  Make sure:")
        print("  1. Database server is running")
        print("  2. Database 'max_queryhub' exists")
        print("  3. Credentials in .env are correct")
        return False

def main():
    """Run all checks"""
    print("Query Hub Backend Diagnostic Tool")
    print("=" * 40)
    
    if not os.path.exists('requirements.txt'):
        print("❌ Not in backend directory. Run from backend/ folder.")
        return
    
    checks = [
        ("Python Version", check_python_version),
        ("Virtual Environment", check_venv),
        ("Environment File", check_env_file),
    ]
    
    all_passed = True
    for name, check_func in checks:
        if not check_func():
            all_passed = False
    
    if all_passed:
        # Only test imports and DB if basic checks pass
        if install_requirements():
            test_database_connection()
            
            print("\nTesting imports...")
            try:
                from test_imports import test_imports
                test_imports()
            except ImportError as e:
                print(f"❌ Import test failed: {e}")
    
    print("\n" + "=" * 40)
    if all_passed:
        print("✅ All checks passed! You can now run: uvicorn app.main:app --reload")
    else:
        print("❌ Some checks failed. Please fix the issues above.")

if __name__ == "__main__":
    main()