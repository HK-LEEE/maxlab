#!/bin/bash

# MaxLab Comprehensive Cleanup Orchestrator
# Coordinates all cleanup tools for systematic project maintenance
# Usage: ./scripts/cleanup.sh [--phase 1|2|3] [--dry-run] [--auto-confirm]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Default options
PHASE="all"
DRY_RUN=false
AUTO_CONFIRM=false
VERBOSE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --phase)
            PHASE="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --auto-confirm)
            AUTO_CONFIRM=true
            shift
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        --help)
            cat << 'EOF'
MaxLab Comprehensive Cleanup Tool

Usage: ./scripts/cleanup.sh [options]

Options:
    --phase <1|2|3|all>    Run specific cleanup phase (default: all)
    --dry-run             Show what would be done without making changes
    --auto-confirm        Skip confirmation prompts (use with caution)
    --verbose             Show detailed output
    --help               Show this help message

Phases:
    1: Safe cleanup (remove duplicates, cache, artifacts)
    2: Code quality (organize files, remove dead code)
    3: Process automation (setup hooks, monitoring)
    all: Run all phases sequentially

Examples:
    ./scripts/cleanup.sh --dry-run                    # Preview all changes
    ./scripts/cleanup.sh --phase 1                    # Safe cleanup only
    ./scripts/cleanup.sh --phase 2 --auto-confirm     # Code quality cleanup
    ./scripts/cleanup.sh --verbose                    # Full cleanup with details
EOF
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

cd "$PROJECT_ROOT"

# Print header
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                   MaxLab Cleanup Orchestrator               ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo
echo -e "${CYAN}Project:${NC} $PROJECT_ROOT"
echo -e "${CYAN}Phase:${NC} $PHASE"
if [[ "$DRY_RUN" == "true" ]]; then
    echo -e "${YELLOW}Mode:${NC} DRY RUN (no changes will be made)"
else
    echo -e "${CYAN}Mode:${NC} EXECUTION"
fi
echo

# Function to run a command with proper logging
run_command() {
    local description="$1"
    local command="$2"
    local phase="$3"
    
    echo -e "${PURPLE}▶${NC} $description"
    
    if [[ "$VERBOSE" == "true" ]]; then
        echo -e "  ${CYAN}Command:${NC} $command"
    fi
    
    if eval "$command"; then
        echo -e "  ${GREEN}✅ Success${NC}"
        return 0
    else
        echo -e "  ${RED}❌ Failed${NC}"
        return 1
    fi
}

# Function to check prerequisites
check_prerequisites() {
    echo -e "${BLUE}🔍 Checking Prerequisites${NC}"
    echo "----------------------------------------"
    
    local missing_tools=()
    
    # Check for Python
    if ! command -v python3 &> /dev/null; then
        missing_tools+=("python3")
    fi
    
    # Check if we're in a git repository
    if ! git rev-parse --git-dir &> /dev/null; then
        echo -e "${YELLOW}⚠️  Warning: Not in a git repository${NC}"
        echo -e "   Some features may not work correctly"
    fi
    
    # Check if cleanup scripts exist
    local scripts=("safe-cleanup.sh" "dead-code-analyzer.py" "organize-files.py")
    for script in "${scripts[@]}"; do
        if [[ ! -f "$SCRIPT_DIR/$script" ]]; then
            missing_tools+=("$script")
        fi
    done
    
    if [[ ${#missing_tools[@]} -gt 0 ]]; then
        echo -e "${RED}❌ Missing required tools:${NC}"
        printf '   - %s\n' "${missing_tools[@]}"
        echo
        echo "Please install missing tools and try again."
        exit 1
    fi
    
    echo -e "${GREEN}✅ All prerequisites satisfied${NC}"
    echo
}

# Function to show project statistics
show_project_stats() {
    echo -e "${BLUE}📊 Current Project Statistics${NC}"
    echo "----------------------------------------"
    
    # Count files by type
    local total_files=$(find . -type f -not -path "./.git/*" -not -path "./node_modules/*" -not -path "*/.venv/*" | wc -l)
    local python_files=$(find . -name "*.py" -not -path "./.venv/*" -not -path "./node_modules/*" | wc -l)
    local js_files=$(find . -name "*.js" -o -name "*.ts" -o -name "*.jsx" -o -name "*.tsx" | grep -v node_modules | wc -l)
    local test_files=$(find . -name "test_*.py" -o -name "*_test.py" | wc -l)
    local cache_dirs=$(find . -name "__pycache__" -type d -not -path "*/.venv/*" | wc -l)
    local log_files=$(find . -name "*.log" -not -path "./node_modules/*" | wc -l)
    
    echo "  Files:"
    echo "    Total: $total_files"
    echo "    Python: $python_files"
    echo "    JavaScript/TypeScript: $js_files"
    echo "    Test files: $test_files"
    echo "  Artifacts:"
    echo "    Cache directories: $cache_dirs"
    echo "    Log files: $log_files"
    
    # Repository size
    if command -v du &> /dev/null; then
        local repo_size=$(du -sh . 2>/dev/null | cut -f1)
        echo "  Repository size: $repo_size"
    fi
    
    echo
}

# Phase 1: Safe Cleanup
run_phase_1() {
    echo -e "${BLUE}🧹 Phase 1: Safe Cleanup${NC}"
    echo "========================================"
    echo "Removing duplicates, cache, and artifacts with minimal risk"
    echo
    
    # Build command options
    local cmd_options=""
    if [[ "$DRY_RUN" == "true" ]]; then
        cmd_options+=" --dry-run"
    fi
    
    # Run safe cleanup script
    local safe_cleanup_cmd="bash $SCRIPT_DIR/safe-cleanup.sh$cmd_options"
    run_command "Running safe cleanup script" "$safe_cleanup_cmd" "1"
    
    echo -e "${GREEN}✅ Phase 1 Complete${NC}"
    echo
}

# Phase 2: Code Quality Cleanup
run_phase_2() {
    echo -e "${BLUE}🔧 Phase 2: Code Quality Cleanup${NC}"
    echo "========================================"
    echo "Organizing files and removing dead code"
    echo
    
    # Build command options
    local cmd_options=""
    if [[ "$DRY_RUN" == "true" ]]; then
        cmd_options+=" --dry-run"
    fi
    if [[ "$AUTO_CONFIRM" == "true" ]]; then
        cmd_options+=" --auto-confirm"
    fi
    
    # Run file organization
    local organize_cmd="python3 $SCRIPT_DIR/organize-files.py$cmd_options --create-guide"
    run_command "Organizing misplaced files" "$organize_cmd" "2"
    
    # Run dead code analysis
    local dead_code_cmd="python3 $SCRIPT_DIR/dead-code-analyzer.py$cmd_options"
    if [[ "$AUTO_CONFIRM" == "true" && "$DRY_RUN" == "false" ]]; then
        dead_code_cmd+=" --remove"
    fi
    run_command "Analyzing dead code" "$dead_code_cmd" "2"
    
    echo -e "${GREEN}✅ Phase 2 Complete${NC}"
    echo
}

# Phase 3: Process Automation
run_phase_3() {
    echo -e "${BLUE}⚙️  Phase 3: Process Automation${NC}"
    echo "========================================"
    echo "Setting up automation and monitoring"
    echo
    
    # Create .gitignore improvements
    local gitignore_updates=""
    gitignore_updates+="\\n# MaxLab Cleanup Tool Additions\\n"
    gitignore_updates+="# Cache directories\\n__pycache__/\\n*.pyc\\n"
    gitignore_updates+="# Log files\\n*.log\\nlogs/\\n"
    gitignore_updates+="# Windows artifacts\\n*:Zone.Identifier\\nThumbs.db\\n"
    gitignore_updates+="# Backup files\\n*.backup\\n*.bak\\n*.orig\\n"
    gitignore_updates+="# IDE artifacts\\n.vscode/\\n.idea/\\n"
    gitignore_updates+="# OS artifacts\\n.DS_Store\\nerror*.png\\n"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        echo -e "${YELLOW}[DRY-RUN]${NC} Would update .gitignore with cleanup patterns"
    else
        # Check if these patterns are already in .gitignore
        if ! grep -q "MaxLab Cleanup Tool" .gitignore 2>/dev/null; then
            echo -e "$gitignore_updates" >> .gitignore
            echo -e "${GREEN}✅ Updated .gitignore with cleanup patterns${NC}"
        else
            echo -e "${GREEN}✅ .gitignore already contains cleanup patterns${NC}"
        fi
    fi
    
    # Create pre-commit hook
    local hook_content='#!/bin/bash
# MaxLab Pre-commit Hook - Prevent committing unnecessary files

# Check for large files (>10MB)
large_files=$(git diff --cached --name-only | xargs ls -la 2>/dev/null | awk '\''$5 > 10485760 {print $9}'\'')
if [[ -n "$large_files" ]]; then
    echo "Error: Attempting to commit large files (>10MB):"
    echo "$large_files"
    exit 1
fi

# Check for cache files
cache_files=$(git diff --cached --name-only | grep -E "(\.pyc|__pycache__|\.log|:Zone\.Identifier|\.backup|\.bak)")
if [[ -n "$cache_files" ]]; then
    echo "Error: Attempting to commit cache/temporary files:"
    echo "$cache_files"
    echo "Run: ./scripts/cleanup.sh --phase 1 to clean these files"
    exit 1
fi

# Check for debug/error files
debug_files=$(git diff --cached --name-only | grep -E "(error[0-9]*\.(png|jpg)|debug\.(log|txt))")
if [[ -n "$debug_files" ]]; then
    echo "Error: Attempting to commit debug files:"
    echo "$debug_files"
    exit 1
fi
'
    
    if [[ "$DRY_RUN" == "true" ]]; then
        echo -e "${YELLOW}[DRY-RUN]${NC} Would create pre-commit hook"
    else
        if [[ -d ".git/hooks" ]]; then
            echo "$hook_content" > .git/hooks/pre-commit
            chmod +x .git/hooks/pre-commit
            echo -e "${GREEN}✅ Created pre-commit hook${NC}"
        else
            echo -e "${YELLOW}⚠️  Warning: Not a git repository, skipping pre-commit hook${NC}"
        fi
    fi
    
    # Create cleanup monitoring script
    local monitor_script="$SCRIPT_DIR/monitor-cleanup.sh"
    if [[ "$DRY_RUN" == "true" ]]; then
        echo -e "${YELLOW}[DRY-RUN]${NC} Would create cleanup monitoring script"
    else
        cat > "$monitor_script" << 'EOF'
#!/bin/bash
# MaxLab Cleanup Monitor
# Run this weekly to check for cleanup opportunities

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🔍 MaxLab Weekly Cleanup Check"
echo "=============================="

# Check for new cache files
cache_count=$(find . -name "__pycache__" -type d -not -path "*/.venv/*" | wc -l)
if [[ $cache_count -gt 0 ]]; then
    echo "⚠️  Found $cache_count cache directories"
    echo "   Run: ./scripts/cleanup.sh --phase 1"
fi

# Check for new log files
log_count=$(find . -name "*.log" -not -path "./node_modules/*" -mtime -7 | wc -l)
if [[ $log_count -gt 5 ]]; then
    echo "⚠️  Found $log_count recent log files"
    echo "   Consider cleanup or log rotation"
fi

# Check for large files
large_files=$(find . -size +10M -type f -not -path "./.git/*" -not -path "./node_modules/*" -not -path "*/.venv/*")
if [[ -n "$large_files" ]]; then
    echo "⚠️  Found large files:"
    echo "$large_files"
fi

echo "✅ Cleanup monitoring complete"
EOF
        chmod +x "$monitor_script"
        echo -e "${GREEN}✅ Created cleanup monitoring script${NC}"
    fi
    
    echo -e "${GREEN}✅ Phase 3 Complete${NC}"
    echo
}

# Function to show final summary
show_summary() {
    echo -e "${BLUE}📋 Cleanup Summary${NC}"
    echo "========================================"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        echo -e "${YELLOW}This was a dry run - no changes were made${NC}"
        echo "Run without --dry-run to execute the cleanup"
    else
        echo -e "${GREEN}✅ Cleanup completed successfully!${NC}"
        
        echo
        echo "🚀 Recommended Next Steps:"
        echo "1. Test your application to ensure everything works"
        echo "2. Run your test suite: cd backend && python -m pytest"
        echo "3. Check git status: git status"
        echo "4. Commit the cleanup changes"
        echo "5. Set up weekly monitoring: ./scripts/monitor-cleanup.sh"
        
        echo
        echo "📈 Benefits Achieved:"
        echo "• Removed duplicate and unnecessary files"
        echo "• Organized test files properly"
        echo "• Cleaned cache and temporary files"
        echo "• Set up automated prevention"
        echo "• Improved development workflow"
    fi
    
    echo
    echo "📖 For more information, see: PROJECT_CLEANUP_STRATEGY.md"
}

# Main execution
main() {
    check_prerequisites
    show_project_stats
    
    case $PHASE in
        "1")
            run_phase_1
            ;;
        "2")
            run_phase_2
            ;;
        "3")
            run_phase_3
            ;;
        "all")
            run_phase_1
            run_phase_2
            run_phase_3
            ;;
        *)
            echo -e "${RED}❌ Invalid phase: $PHASE${NC}"
            echo "Valid phases: 1, 2, 3, all"
            exit 1
            ;;
    esac
    
    show_summary
}

# Run main function
main