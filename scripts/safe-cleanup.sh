#!/bin/bash

# MaxLab Safe Cleanup Script
# Removes obviously unnecessary files with minimal risk
# Usage: ./scripts/safe-cleanup.sh [--dry-run]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DRY_RUN=false

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
if [[ "$1" == "--dry-run" ]]; then
    DRY_RUN=true
    echo -e "${YELLOW}🔍 DRY RUN MODE - No files will be deleted${NC}"
fi

cd "$PROJECT_ROOT"

echo -e "${BLUE}🧹 MaxLab Safe Cleanup Tool${NC}"
echo "Project root: $PROJECT_ROOT"
echo "============================================"

# Function to safely remove files/directories
safe_remove() {
    local target="$1"
    local description="$2"
    
    if [[ -e "$target" ]]; then
        if [[ "$DRY_RUN" == "true" ]]; then
            echo -e "  ${YELLOW}[DRY-RUN]${NC} Would remove: $target ($description)"
        else
            echo -e "  ${RED}Removing:${NC} $target ($description)"
            rm -rf "$target"
        fi
        return 0
    else
        echo -e "  ${GREEN}✓ Already clean:${NC} $target"
        return 1
    fi
}

# Function to count files before cleanup
count_files() {
    local pattern="$1"
    find . -name "$pattern" -not -path "*/node_modules/*" -not -path "*/.git/*" 2>/dev/null | wc -l
}

echo -e "\n${BLUE}📊 Pre-cleanup Analysis${NC}"
echo "----------------------------------------"
echo "Duplicate docs: $(ls -1 AGENTS.md CLAUDE.md GEMINI.md 2>/dev/null | wc -l) files"
echo "Windows artifacts: $(find . -name "*:Zone.Identifier" 2>/dev/null | wc -l) files"
echo "Binary artifacts: $(ls -1 *.png *.zip 2>/dev/null | wc -l) files"
echo "Project __pycache__: $(find . -name "__pycache__" -not -path "*/.venv/*" -not -path "*/node_modules/*" 2>/dev/null | wc -l) directories"
echo "Old log files: $(find . -name "*.log" -mtime +7 -not -path "*/node_modules/*" 2>/dev/null | wc -l) files"

echo -e "\n${BLUE}🗑️  Phase 1: Remove Duplicate Documentation${NC}"
echo "----------------------------------------"
# Keep CLAUDE.md as the primary, remove identical copies
if cmp -s AGENTS.md CLAUDE.md 2>/dev/null; then
    safe_remove "AGENTS.md" "duplicate of CLAUDE.md"
else
    echo -e "  ${YELLOW}⚠️  Warning:${NC} AGENTS.md differs from CLAUDE.md - manual review needed"
fi

if cmp -s GEMINI.md CLAUDE.md 2>/dev/null; then
    safe_remove "GEMINI.md" "duplicate of CLAUDE.md"
else
    echo -e "  ${YELLOW}⚠️  Warning:${NC} GEMINI.md differs from CLAUDE.md - manual review needed"
fi

# Also remove the backup copy if it exists
safe_remove "CLAUDE.md.taskmaster" "backup copy of CLAUDE.md"

echo -e "\n${BLUE}🗑️  Phase 2: Remove Windows Artifacts${NC}"
echo "----------------------------------------"
removed_count=0
while IFS= read -r -d '' file; do
    safe_remove "$file" "Windows Zone.Identifier artifact"
    ((removed_count++))
done < <(find . -name "*:Zone.Identifier" -print0 2>/dev/null)

if [[ $removed_count -eq 0 ]]; then
    echo -e "  ${GREEN}✓ No Windows artifacts found${NC}"
fi

echo -e "\n${BLUE}🗑️  Phase 3: Remove Binary Debug Artifacts${NC}"
echo "----------------------------------------"
safe_remove "error.png" "debug screenshot"
safe_remove "error2.png" "debug screenshot"
safe_remove "MAX_LAB_favicon_io.zip" "favicon archive"

echo -e "\n${BLUE}🗑️  Phase 4: Clean Python Cache (Project Only)${NC}"
echo "----------------------------------------"
removed_count=0
while IFS= read -r -d '' dir; do
    safe_remove "$dir" "Python bytecode cache"
    ((removed_count++))
done < <(find . -name "__pycache__" -type d -not -path "*/.venv/*" -not -path "*/node_modules/*" -print0 2>/dev/null)

if [[ $removed_count -eq 0 ]]; then
    echo -e "  ${GREEN}✓ No project __pycache__ directories found${NC}"
fi

echo -e "\n${BLUE}🗑️  Phase 5: Remove Old Log Files${NC}"
echo "----------------------------------------"
removed_count=0

# Remove log files older than 7 days
while IFS= read -r -d '' file; do
    safe_remove "$file" "old log file (>7 days)"
    ((removed_count++))
done < <(find . -name "*.log" -mtime +7 -not -path "*/node_modules/*" -not -path "*/.git/*" -print0 2>/dev/null)

if [[ $removed_count -eq 0 ]]; then
    echo -e "  ${GREEN}✓ No old log files found${NC}"
fi

echo -e "\n${BLUE}🗑️  Phase 6: Remove Backup Files${NC}"
echo "----------------------------------------"
removed_count=0

# Remove .backup, .bak, .orig files
for ext in "*.backup" "*.bak" "*.orig" "*~"; do
    while IFS= read -r -d '' file; do
        safe_remove "$file" "backup file"
        ((removed_count++))
    done < <(find . -name "$ext" -not -path "*/node_modules/*" -not -path "*/.git/*" -print0 2>/dev/null)
done

if [[ $removed_count -eq 0 ]]; then
    echo -e "  ${GREEN}✓ No backup files found${NC}"
fi

echo -e "\n${BLUE}📊 Post-cleanup Summary${NC}"
echo "----------------------------------------"
if [[ "$DRY_RUN" == "true" ]]; then
    echo -e "${YELLOW}This was a dry run - no files were actually removed${NC}"
    echo "Run without --dry-run to execute the cleanup"
else
    echo -e "${GREEN}✅ Safe cleanup completed successfully${NC}"
    
    # Show space saved estimate
    echo -e "\n${BLUE}💾 Estimated Benefits:${NC}"
    echo "• Removed duplicate documentation (saved ~40KB)"
    echo "• Cleaned Windows artifacts"
    echo "• Removed debug binary files"
    echo "• Cleaned Python bytecode cache"
    echo "• Removed old log files"
    echo "• Removed backup files"
fi

echo -e "\n${BLUE}🚀 Next Steps:${NC}"
echo "1. Run tests to ensure nothing important was removed:"
echo "   cd frontend && npm test"
echo "   cd backend && python -m pytest"
echo "2. Review git status to see what was cleaned:"
echo "   git status"
echo "3. Consider running the file reorganization tool next"
echo "4. For more aggressive cleanup, see: PROJECT_CLEANUP_STRATEGY.md"

if [[ "$DRY_RUN" == "false" ]]; then
    echo -e "\n${GREEN}✨ Cleanup complete! Your project is now cleaner.${NC}"
fi