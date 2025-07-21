#!/usr/bin/env python3
"""
Script to remove unused imports from TypeScript/JavaScript and Python files.
This should be run after reviewing the unused imports report.
"""

import os
import re
import ast
from pathlib import Path
from typing import Set, List, Dict
import argparse
import shutil
from datetime import datetime

class UnusedImportsRemover:
    def __init__(self, base_path: str, dry_run: bool = True, backup: bool = True):
        self.base_path = Path(base_path)
        self.dry_run = dry_run
        self.backup = backup
        self.changes_made = {"frontend": 0, "backend": 0}
        
    def backup_file(self, file_path: Path):
        """Create a backup of the file before modifying."""
        if self.backup:
            backup_dir = self.base_path / "backups" / "unused_imports" / datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_dir.mkdir(parents=True, exist_ok=True)
            
            rel_path = file_path.relative_to(self.base_path)
            backup_path = backup_dir / rel_path
            backup_path.parent.mkdir(parents=True, exist_ok=True)
            
            shutil.copy2(file_path, backup_path)
            print(f"Backed up: {rel_path}")
    
    def remove_unused_imports_ts(self, file_path: Path, unused_imports: List[str]) -> bool:
        """Remove unused imports from TypeScript/JavaScript files."""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            original_content = content
            modified = False
            
            for unused in unused_imports:
                # Parse the unused import string
                match = re.match(r"(.+) from '(.+)'", unused)
                if not match:
                    continue
                
                import_name = match.group(1).strip()
                module_name = match.group(2).strip()
                
                # Create patterns to match different import styles
                patterns = [
                    # Named import: import { X } from 'module'
                    (rf'import\s*\{{\s*([^}}]*\b{re.escape(import_name)}\b[^}}]*)\s*\}}\s*from\s*[\'"]({re.escape(module_name)})[\'"]\s*;?', 'named'),
                    # Default import: import X from 'module'
                    (rf'import\s+{re.escape(import_name)}\s+from\s*[\'"]({re.escape(module_name)})[\'"]\s*;?', 'default'),
                    # Namespace import: import * as X from 'module'
                    (rf'import\s*\*\s*as\s+{re.escape(import_name)}\s+from\s*[\'"]({re.escape(module_name)})[\'"]\s*;?', 'namespace'),
                ]
                
                for pattern, import_type in patterns:
                    matches = list(re.finditer(pattern, content))
                    
                    for match in matches:
                        if import_type == 'named':
                            # Handle named imports - might need to remove just one import
                            imports_str = match.group(1)
                            imports = [imp.strip() for imp in imports_str.split(',')]
                            
                            if len(imports) == 1:
                                # Remove entire import statement
                                content = content.replace(match.group(0), '')
                                modified = True
                            else:
                                # Remove just this import
                                new_imports = [imp for imp in imports if import_name not in imp]
                                new_imports_str = ', '.join(new_imports)
                                new_statement = f"import {{ {new_imports_str} }} from '{module_name}'"
                                content = content.replace(match.group(0), new_statement)
                                modified = True
                        else:
                            # Remove entire import statement
                            content = content.replace(match.group(0), '')
                            modified = True
            
            # Clean up multiple blank lines
            content = re.sub(r'\n\s*\n\s*\n', '\n\n', content)
            
            if modified and content != original_content:
                if not self.dry_run:
                    self.backup_file(file_path)
                    with open(file_path, 'w', encoding='utf-8') as f:
                        f.write(content)
                self.changes_made["frontend"] += 1
                return True
            
            return False
            
        except Exception as e:
            print(f"Error processing {file_path}: {e}")
            return False
    
    def remove_unused_imports_py(self, file_path: Path, unused_imports: List[str]) -> bool:
        """Remove unused imports from Python files using AST."""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Parse the AST
            tree = ast.parse(content)
            
            # Create a set of unused import names for quick lookup
            unused_set = set(unused_imports)
            
            # Track lines to remove
            lines_to_remove = set()
            
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    for alias in node.names:
                        if alias.name in unused_set:
                            lines_to_remove.add(node.lineno)
                elif isinstance(node, ast.ImportFrom):
                    # Check if all imports from this statement are unused
                    all_unused = all(
                        f"{node.module}.{alias.name}" in unused_set or alias.name in unused_set
                        for alias in node.names
                    )
                    
                    if all_unused:
                        lines_to_remove.add(node.lineno)
                    elif any(f"{node.module}.{alias.name}" in unused_set or alias.name in unused_set for alias in node.names):
                        # Some imports are unused - need to modify the line
                        # This is more complex and would require more sophisticated AST manipulation
                        # For now, we'll skip partial removal
                        pass
            
            if lines_to_remove:
                # Remove the lines
                lines = content.split('\n')
                new_lines = []
                
                for i, line in enumerate(lines, 1):
                    if i not in lines_to_remove:
                        new_lines.append(line)
                
                new_content = '\n'.join(new_lines)
                
                # Clean up multiple blank lines
                new_content = re.sub(r'\n\s*\n\s*\n', '\n\n', new_content)
                
                if not self.dry_run:
                    self.backup_file(file_path)
                    with open(file_path, 'w', encoding='utf-8') as f:
                        f.write(new_content)
                
                self.changes_made["backend"] += 1
                return True
            
            return False
            
        except Exception as e:
            print(f"Error processing {file_path}: {e}")
            return False
    
    def process_results(self, results: Dict[str, Dict[str, List[str]]]):
        """Process the results from unused imports analysis."""
        print("=" * 80)
        print(f"REMOVING UNUSED IMPORTS ({'DRY RUN' if self.dry_run else 'ACTUAL RUN'})")
        print("=" * 80)
        
        # Process frontend files
        for file_path, unused_imports in results.get("frontend", {}).items():
            full_path = self.base_path / file_path
            if full_path.exists():
                print(f"\nProcessing: {file_path}")
                if self.remove_unused_imports_ts(full_path, unused_imports):
                    print(f"  ✓ {'Would remove' if self.dry_run else 'Removed'} {len(unused_imports)} imports")
                else:
                    print(f"  - No changes made")
        
        # Process backend files
        for file_path, unused_imports in results.get("backend", {}).items():
            full_path = self.base_path / file_path
            if full_path.exists():
                print(f"\nProcessing: {file_path}")
                if self.remove_unused_imports_py(full_path, unused_imports):
                    print(f"  ✓ {'Would remove' if self.dry_run else 'Removed'} imports")
                else:
                    print(f"  - No changes made")
        
        print("\n" + "=" * 80)
        print("SUMMARY")
        print("=" * 80)
        print(f"Frontend files {'would be' if self.dry_run else ''} modified: {self.changes_made['frontend']}")
        print(f"Backend files {'would be' if self.dry_run else ''} modified: {self.changes_made['backend']}")
        
        if self.dry_run:
            print("\nThis was a DRY RUN. No files were actually modified.")
            print("To actually remove unused imports, run with --no-dry-run flag")


def main():
    parser = argparse.ArgumentParser(description='Remove unused imports from TypeScript/JavaScript and Python files')
    parser.add_argument('--no-dry-run', action='store_true', help='Actually remove unused imports (default is dry run)')
    parser.add_argument('--no-backup', action='store_true', help='Do not create backups before modifying files')
    parser.add_argument('--results-file', help='Path to JSON file with unused imports results')
    
    args = parser.parse_args()
    
    # Get the project root
    project_root = Path(__file__).parent.parent
    
    # If no results file provided, run the analysis first
    if not args.results_file:
        print("Running unused imports analysis first...")
        from find_unused_imports import UnusedImportsFinder
        
        finder = UnusedImportsFinder(project_root)
        finder.scan_directory()
        results = finder.results
    else:
        # Load results from file
        import json
        with open(args.results_file, 'r') as f:
            results = json.load(f)
    
    # Create remover and process results
    remover = UnusedImportsRemover(
        project_root,
        dry_run=not args.no_dry_run,
        backup=not args.no_backup
    )
    
    remover.process_results(results)


if __name__ == "__main__":
    main()