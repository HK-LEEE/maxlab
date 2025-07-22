#!/usr/bin/env python3
"""
MaxLab File Organization Tool
Reorganizes misplaced files into proper directory structures.
Usage: python scripts/organize-files.py [--dry-run] [--auto-confirm]
"""

import os
import shutil
import argparse
from pathlib import Path
from typing import List, Dict, Tuple
import re

class FileOrganizer:
    def __init__(self, project_root: str):
        self.project_root = Path(project_root)
        self.moves = []
        self.stats = {
            'files_moved': 0,
            'directories_created': 0,
            'test_files_organized': 0,
            'config_files_organized': 0
        }
    
    def analyze_misplaced_files(self) -> List[Dict]:
        """Analyze the project for misplaced files."""
        issues = []
        
        # Find misplaced test files in backend root
        backend_root = self.project_root / 'backend'
        if backend_root.exists():
            test_files = list(backend_root.glob('test_*.py')) + list(backend_root.glob('*_test.py'))
            for test_file in test_files:
                if test_file.is_file():
                    issues.append({
                        'type': 'misplaced_test',
                        'current_path': test_file,
                        'suggested_path': self._suggest_test_location(test_file),
                        'reason': 'Test files should be in tests/ directory'
                    })
        
        # Find AI config proliferation
        ai_configs = ['.clinerules', '.cursor', '.gemini', '.roo', '.trae', '.windsurf', '.roomodes']
        for config_dir in ai_configs:
            config_path = self.project_root / config_dir
            if config_path.exists():
                issues.append({
                    'type': 'ai_config_cleanup',
                    'current_path': config_path,
                    'suggested_path': None,  # Should be removed
                    'reason': f'Unused AI tool configuration (keep only .claude)'
                })
        
        # Find documentation files that could be organized
        doc_files = list(self.project_root.glob('*.md'))
        large_docs = [f for f in doc_files if f.stat().st_size > 10000]  # > 10KB
        if len(large_docs) > 5:
            docs_dir = self.project_root / 'docs'
            for doc_file in large_docs:
                if doc_file.name not in ['README.md', 'CLAUDE.md']:  # Keep these at root
                    issues.append({
                        'type': 'organize_docs',
                        'current_path': doc_file,
                        'suggested_path': docs_dir / doc_file.name,
                        'reason': 'Large documentation files should be in docs/ directory'
                    })
        
        return issues
    
    def _suggest_test_location(self, test_file: Path) -> Path:
        """Suggest the best location for a test file based on its name and content."""
        backend_tests = self.project_root / 'backend' / 'tests'
        
        # Analyze test file name and content to categorize
        filename = test_file.name.lower()
        
        try:
            with open(test_file, 'r', encoding='utf-8') as f:
                content = f.read().lower()
        except:
            content = ""
        
        # Integration tests (involve multiple components, APIs, database)
        integration_keywords = [
            'api', 'endpoint', 'integration', 'database', 'oauth', 'auth',
            'external', 'provider', 'workspace', 'permission'
        ]
        
        # Unit tests (test individual functions/classes)
        unit_keywords = [
            'unittest', 'mock', 'patch', 'unit', 'function', 'class'
        ]
        
        # Performance/load tests
        performance_keywords = [
            'performance', 'load', 'stress', 'benchmark'
        ]
        
        # Quick/debug tests
        debug_keywords = [
            'quick', 'debug', 'simple', 'test_simple'
        ]
        
        # Categorize based on filename and content
        if any(keyword in filename or keyword in content for keyword in integration_keywords):
            return backend_tests / 'integration' / test_file.name
        elif any(keyword in filename or keyword in content for keyword in unit_keywords):
            return backend_tests / 'unit' / test_file.name
        elif any(keyword in filename or keyword in content for keyword in performance_keywords):
            return backend_tests / 'performance' / test_file.name
        elif any(keyword in filename or keyword in content for keyword in debug_keywords):
            return backend_tests / 'debug' / test_file.name
        else:
            # Default to integration for API-related tests
            return backend_tests / 'integration' / test_file.name
    
    def create_directory_structure(self, dry_run: bool = False) -> None:
        """Create necessary directory structure for organized files."""
        directories_to_create = [
            self.project_root / 'backend' / 'tests' / 'unit',
            self.project_root / 'backend' / 'tests' / 'integration',
            self.project_root / 'backend' / 'tests' / 'performance',
            self.project_root / 'backend' / 'tests' / 'debug',
            self.project_root / 'backend' / 'tests' / 'fixtures',
            self.project_root / 'docs' / 'archived',
        ]
        
        for directory in directories_to_create:
            if not directory.exists():
                if dry_run:
                    print(f"  [DRY-RUN] Would create directory: {directory}")
                else:
                    directory.mkdir(parents=True, exist_ok=True)
                    print(f"  ✅ Created directory: {directory}")
                    self.stats['directories_created'] += 1
    
    def organize_files(self, issues: List[Dict], dry_run: bool = False, auto_confirm: bool = False) -> None:
        """Organize files based on analysis."""
        print("🗂️  File Organization Plan:")
        print("=" * 50)
        
        for issue in issues:
            current_path = issue['current_path']
            suggested_path = issue['suggested_path']
            reason = issue['reason']
            
            print(f"\n📁 {issue['type'].replace('_', ' ').title()}")
            print(f"   Current: {current_path}")
            if suggested_path:
                print(f"   Suggested: {suggested_path}")
            else:
                print(f"   Action: REMOVE")
            print(f"   Reason: {reason}")
            
            if not auto_confirm and not dry_run:
                response = input("   Proceed? (y/n/skip): ").lower()
                if response not in ['y', 'yes']:
                    print("   ⏭️  Skipped")
                    continue
            
            # Execute the organization
            if dry_run:
                if suggested_path:
                    print(f"   [DRY-RUN] Would move to: {suggested_path}")
                else:
                    print(f"   [DRY-RUN] Would remove: {current_path}")
            else:
                if suggested_path:
                    self._move_file_safely(current_path, suggested_path)
                else:
                    self._remove_safely(current_path)
    
    def _move_file_safely(self, source: Path, destination: Path) -> bool:
        """Safely move a file to destination, creating directories as needed."""
        try:
            # Create destination directory if it doesn't exist
            destination.parent.mkdir(parents=True, exist_ok=True)
            
            # Handle file conflicts
            if destination.exists():
                backup_path = destination.with_suffix(destination.suffix + '.backup')
                shutil.move(str(destination), str(backup_path))
                print(f"   📦 Backed up existing file: {backup_path}")
            
            # Move the file
            shutil.move(str(source), str(destination))
            print(f"   ✅ Moved: {source} → {destination}")
            
            self.stats['files_moved'] += 1
            if 'test' in source.name.lower():
                self.stats['test_files_organized'] += 1
            
            return True
            
        except Exception as e:
            print(f"   ❌ Error moving {source}: {e}")
            return False
    
    def _remove_safely(self, path: Path) -> bool:
        """Safely remove a file or directory."""
        try:
            if path.is_file():
                path.unlink()
                print(f"   🗑️  Removed file: {path}")
            elif path.is_dir():
                shutil.rmtree(str(path))
                print(f"   🗑️  Removed directory: {path}")
            
            self.stats['config_files_organized'] += 1
            return True
            
        except Exception as e:
            print(f"   ❌ Error removing {path}: {e}")
            return False
    
    def create_test_organization_guide(self) -> None:
        """Create a guide for test organization."""
        guide_path = self.project_root / 'backend' / 'tests' / 'README.md'
        
        guide_content = """# MaxLab Test Organization Guide

## Directory Structure

```
tests/
├── unit/              # Unit tests (test individual functions/classes)
├── integration/       # Integration tests (test API endpoints, database operations)
├── performance/       # Performance and load tests
├── debug/            # Quick debug and development tests
└── fixtures/         # Test data and fixtures
```

## Test Categories

### Unit Tests (`unit/`)
- Test individual functions, classes, or components in isolation
- Use mocks for external dependencies
- Fast execution (< 1 second per test)
- High code coverage

### Integration Tests (`integration/`)
- Test interactions between components
- Test API endpoints with real database
- Test OAuth and authentication flows
- Test external service integrations

### Performance Tests (`performance/`)
- Load testing
- Stress testing
- Benchmark tests
- Performance regression tests

### Debug Tests (`debug/`)
- Quick development tests
- Debugging specific issues
- Temporary tests for development
- Should be cleaned up regularly

## Running Tests

```bash
# Run all tests
pytest

# Run specific category
pytest tests/unit/
pytest tests/integration/

# Run with coverage
pytest --cov=app tests/

# Run performance tests
pytest tests/performance/ -v
```

## Test Naming Conventions

- `test_<function_name>.py` for unit tests
- `test_<feature>_api.py` for API integration tests
- `test_<component>_integration.py` for integration tests
- `load_test_<feature>.py` for performance tests

## Best Practices

1. Keep tests isolated and independent
2. Use descriptive test names
3. Follow AAA pattern (Arrange, Act, Assert)
4. Clean up test data after tests
5. Use fixtures for common test setup
6. Keep debug tests temporary

Generated by MaxLab File Organization Tool
"""
        
        try:
            with open(guide_path, 'w', encoding='utf-8') as f:
                f.write(guide_content)
            print(f"  📖 Created test organization guide: {guide_path}")
        except Exception as e:
            print(f"  ❌ Error creating test guide: {e}")
    
    def generate_summary(self) -> str:
        """Generate a summary of organization actions."""
        summary = []
        summary.append("# File Organization Summary\n")
        
        summary.append("## Statistics")
        summary.append(f"- Files moved: {self.stats['files_moved']}")
        summary.append(f"- Directories created: {self.stats['directories_created']}")
        summary.append(f"- Test files organized: {self.stats['test_files_organized']}")
        summary.append(f"- Config files organized: {self.stats['config_files_organized']}")
        
        summary.append("\n## Benefits")
        summary.append("- ✅ Test files properly organized")
        summary.append("- ✅ Cleaner project root")
        summary.append("- ✅ Better development workflow")
        summary.append("- ✅ Easier for new developers")
        
        summary.append("\n## Next Steps")
        summary.append("1. Update your IDE/editor configuration")
        summary.append("2. Update CI/CD test runners")
        summary.append("3. Inform team about new structure")
        summary.append("4. Update documentation")
        
        return "\n".join(summary)

def main():
    parser = argparse.ArgumentParser(description="MaxLab File Organization Tool")
    parser.add_argument('--dry-run', action='store_true', help='Show what would be done without making changes')
    parser.add_argument('--auto-confirm', action='store_true', help='Auto-confirm all moves (use with caution)')
    parser.add_argument('--create-guide', action='store_true', help='Create test organization guide')
    
    args = parser.parse_args()
    
    project_root = os.path.abspath('.')
    organizer = FileOrganizer(project_root)
    
    print("🗂️  MaxLab File Organization Tool")
    print(f"Project root: {project_root}")
    
    if args.dry_run:
        print("🔍 DRY RUN MODE - No files will be moved")
    
    print("\n📊 Analyzing file organization...")
    issues = organizer.analyze_misplaced_files()
    
    if not issues:
        print("✅ No organization issues found! Your project is well organized.")
        return
    
    print(f"Found {len(issues)} organization opportunities:")
    
    # Create necessary directories
    print("\n📁 Creating directory structure...")
    organizer.create_directory_structure(dry_run=args.dry_run)
    
    # Organize files
    print(f"\n🗂️  Organizing files...")
    organizer.organize_files(issues, dry_run=args.dry_run, auto_confirm=args.auto_confirm)
    
    # Create test guide if requested
    if args.create_guide and not args.dry_run:
        print("\n📖 Creating test organization guide...")
        organizer.create_test_organization_guide()
    
    # Print summary
    print("\n" + "="*60)
    print(organizer.generate_summary())
    
    if args.dry_run:
        print("\n🔍 This was a dry run. Use without --dry-run to execute changes.")
    else:
        print("\n✅ File organization complete!")

if __name__ == "__main__":
    main()