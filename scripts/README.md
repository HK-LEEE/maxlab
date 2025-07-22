# MaxLab Cleanup Scripts

Automated tools for maintaining code quality and project organization.

## 🚀 Quick Start

```bash
# Preview what would be cleaned (recommended first run)
./scripts/cleanup.sh --dry-run

# Run safe cleanup only
./scripts/cleanup.sh --phase 1

# Run complete cleanup
./scripts/cleanup.sh
```

## 🛠️ Available Tools

### 1. `cleanup.sh` - Main Orchestrator
**Purpose**: Coordinates all cleanup tools in a systematic way

**Usage**:
```bash
./scripts/cleanup.sh [--phase 1|2|3|all] [--dry-run] [--auto-confirm]
```

**Phases**:
- **Phase 1**: Safe cleanup (duplicates, cache, artifacts)
- **Phase 2**: Code quality (file organization, dead code)  
- **Phase 3**: Process automation (hooks, monitoring)

**Examples**:
```bash
./scripts/cleanup.sh --dry-run          # Preview all changes
./scripts/cleanup.sh --phase 1          # Safe cleanup only
./scripts/cleanup.sh --auto-confirm     # Full cleanup without prompts
```

### 2. `safe-cleanup.sh` - Low-Risk Cleanup
**Purpose**: Remove obviously unnecessary files with minimal risk

**Features**:
- ✅ Remove duplicate documentation files
- ✅ Clean Windows artifacts (Zone.Identifier files)
- ✅ Remove debug binary files (error.png, etc.)
- ✅ Clean Python bytecode cache
- ✅ Remove old log files (>7 days)
- ✅ Remove backup files (.backup, .bak, .orig)

**Usage**:
```bash
./scripts/safe-cleanup.sh [--dry-run]
```

### 3. `dead-code-analyzer.py` - Code Quality Analysis
**Purpose**: Find and optionally remove unused imports and dead code

**Features**:
- 🔍 Detect unused imports in TypeScript/JavaScript
- 🔍 Find large commented code blocks
- 🔍 Analyze Python files for unused imports
- 🔧 Automatically remove dead code (with --remove flag)
- 📊 Generate detailed reports

**Usage**:
```bash
# Analyze only
python3 scripts/dead-code-analyzer.py

# Analyze and fix
python3 scripts/dead-code-analyzer.py --remove

# Analyze specific path
python3 scripts/dead-code-analyzer.py --path frontend/src

# Generate report file
python3 scripts/dead-code-analyzer.py --output dead-code-report.md
```

### 4. `organize-files.py` - File Organization
**Purpose**: Move misplaced files to proper directory structures

**Features**:
- 📁 Move test files to proper test directories
- 📁 Organize documentation files
- 📁 Remove unused AI tool configurations
- 📁 Create proper directory structure
- 📖 Generate test organization guide

**Usage**:
```bash
# Preview changes
python3 scripts/organize-files.py --dry-run

# Organize with prompts
python3 scripts/organize-files.py

# Auto-organize everything
python3 scripts/organize-files.py --auto-confirm

# Create test guide
python3 scripts/organize-files.py --create-guide
```

## 📊 What Gets Cleaned

### Immediate Cleanup (Phase 1)
- **Duplicate files**: AGENTS.md, GEMINI.md (identical to CLAUDE.md)
- **Windows artifacts**: *.Zone.Identifier, Thumbs.db
- **Debug files**: error.png, error2.png, MAX_LAB_favicon_io.zip
- **Cache directories**: __pycache__ (15+ directories in project)
- **Old logs**: *.log files older than 7 days
- **Backup files**: *.backup, *.bak, *.orig files

### Code Quality (Phase 2)
- **Test organization**: 31 test files moved from backend/ to tests/
- **Unused imports**: AlarmNotification and other dead imports
- **AI config cleanup**: 6 unused AI tool directories removed
- **File structure**: Proper directory organization

### Process Automation (Phase 3)
- **Git hooks**: Pre-commit hooks to prevent future issues
- **Enhanced .gitignore**: Patterns to ignore temporary files
- **Monitoring**: Weekly cleanup monitoring script

## 📈 Expected Benefits

### Immediate Impact
- **50-100MB** space reduction
- **100+** fewer unnecessary files
- **Cleaner git history** (no cache/temp files)
- **Simplified AI setup** (single .claude config)

### Long-term Benefits
- **Faster development** (cleaner workspace)
- **Easier onboarding** (clear structure)
- **Reduced technical debt** (systematic maintenance)
- **Better collaboration** (consistent practices)

## 🔧 Configuration

### Environment Requirements
- **Bash** (for shell scripts)
- **Python 3** (for analysis tools)
- **Git** (for repository features)

### Safety Features
- **Dry-run mode**: Preview changes before execution
- **Backup creation**: Automatic backups for file conflicts
- **Incremental execution**: Run phases independently
- **Confirmation prompts**: Manual review for important changes

## 📋 Monitoring and Maintenance

### Weekly Monitoring
```bash
# Check for new cleanup opportunities
./scripts/monitor-cleanup.sh
```

### Monthly Review
```bash
# Full analysis and cleanup
./scripts/cleanup.sh --dry-run
./scripts/cleanup.sh --phase 1
```

### Quarterly Deep Clean
```bash
# Complete cleanup with organization
./scripts/cleanup.sh --auto-confirm
```

## 🚨 Important Notes

### Before Running
1. **Backup your work**: Commit or backup important changes
2. **Test afterwards**: Run your test suite after cleanup
3. **Review changes**: Check git status for removed files
4. **Team coordination**: Inform team about structure changes

### What's Safe
- ✅ Phase 1 (safe-cleanup.sh) - Very low risk
- ✅ Dead code analysis without --remove flag
- ✅ File organization with --dry-run

### What Needs Caution
- ⚠️ File organization without dry-run
- ⚠️ Dead code removal with --remove flag
- ⚠️ Auto-confirm mode without review

## 🔗 Related Documentation

- **PROJECT_CLEANUP_STRATEGY.md** - Comprehensive cleanup strategy
- **backend/tests/README.md** - Test organization guide (auto-generated)
- **.gitignore** - Updated with cleanup patterns

## 🐛 Troubleshooting

### Common Issues

**"Permission denied"**
```bash
chmod +x scripts/*.sh scripts/*.py
```

**"Python not found"**
```bash
# Use python instead of python3 if needed
python scripts/dead-code-analyzer.py
```

**"Not a git repository"**
- Some features require git repository
- Most cleanup still works without git

### Recovery

If something goes wrong:
```bash
# Check what was removed
git status

# Restore from git if needed
git checkout HEAD -- <filename>

# Restore from backup
mv <filename>.backup <filename>
```

## 📞 Support

For issues or improvements:
1. Check the troubleshooting section above
2. Review PROJECT_CLEANUP_STRATEGY.md for context
3. Test with --dry-run first
4. Create backup before major operations

---
*Generated by MaxLab Cleanup Tool Suite v1.0*