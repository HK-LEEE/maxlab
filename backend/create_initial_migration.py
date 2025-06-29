#!/usr/bin/env python3
"""
Script to create initial database migration
"""
import subprocess
import sys

def main():
    print("Creating initial database migration...")
    
    # Create the initial migration
    result = subprocess.run(
        ["alembic", "revision", "--autogenerate", "-m", "Initial migration"],
        capture_output=True,
        text=True
    )
    
    if result.returncode != 0:
        print(f"Error creating migration: {result.stderr}")
        sys.exit(1)
    
    print("Migration created successfully!")
    print(result.stdout)

if __name__ == "__main__":
    main()