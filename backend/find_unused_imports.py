#!/usr/bin/env python3
"""
Script to find unused imports in TypeScript/JavaScript and Python files.
"""

import os
import re
from pathlib import Path
from typing import Dict, List, Set, Tuple
import ast
import subprocess
import json

class UnusedImportsFinder:
    def __init__(self, base_path: str):
        self.base_path = Path(base_path)
        self.results = {"frontend": {}, "backend": {}}
        
    def find_unused_imports_ts(self, file_path: Path) -> List[str]:
        """Find unused imports in TypeScript/JavaScript files."""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Skip files that are too small to have meaningful imports
            if len(content) < 50:
                return []
            
            unused = []
            
            # Find all import statements
            # Handle different import patterns
            import_patterns = [
                # import { X, Y } from 'module'
                r'import\s*\{([^}]+)\}\s*from\s*[\'"]([^\'"]*)[\'"]\s*;?',
                # import X from 'module'
                r'import\s+(\w+)\s+from\s*[\'"]([^\'"]*)[\'"]\s*;?',
                # import * as X from 'module'
                r'import\s*\*\s*as\s+(\w+)\s+from\s*[\'"]([^\'"]*)[\'"]\s*;?',
                # import type { X } from 'module'
                r'import\s+type\s*\{([^}]+)\}\s*from\s*[\'"]([^\'"]*)[\'"]\s*;?',
            ]
            
            all_imports = []
            
            for pattern in import_patterns:
                matches = re.finditer(pattern, content, re.MULTILINE)
                for match in matches:
                    if pattern.startswith(r'import\s*\{') or pattern.startswith(r'import\s+type'):
                        # Handle named imports
                        imports_str = match.group(1)
                        module = match.group(2)
                        # Split by comma and clean up
                        imports = [imp.strip().split(' as ')[0].strip() 
                                 for imp in imports_str.split(',')]
                        for imp in imports:
                            if imp:
                                all_imports.append((imp, module, match.group(0)))
                    else:
                        # Handle default or namespace imports
                        import_name = match.group(1)
                        module = match.group(2)
                        all_imports.append((import_name, module, match.group(0)))
            
            # Check if each import is used
            for import_name, module, full_import in all_imports:
                # Skip CSS/style imports (used for side effects)
                if module.endswith('.css') or module.endswith('.scss') or module.endswith('.less'):
                    continue
                
                # Remove the import statement from content to avoid self-matching
                check_content = content.replace(full_import, '')
                
                # Check if the import is used anywhere in the file
                # Look for word boundaries to avoid partial matches
                usage_pattern = r'\b' + re.escape(import_name) + r'\b'
                
                if not re.search(usage_pattern, check_content):
                    unused.append(f"{import_name} from '{module}'")
            
            return unused
            
        except Exception as e:
            print(f"Error processing {file_path}: {e}")
            return []
    
    def find_unused_imports_py(self, file_path: Path) -> List[str]:
        """Find unused imports in Python files."""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Parse the AST
            tree = ast.parse(content)
            
            # Collect all imports
            imports = {}
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    for alias in node.names:
                        name = alias.asname if alias.asname else alias.name
                        imports[name] = alias.name
                elif isinstance(node, ast.ImportFrom):
                    for alias in node.names:
                        name = alias.asname if alias.asname else alias.name
                        module = node.module or ''
                        imports[name] = f"{module}.{alias.name}" if module else alias.name
            
            # Find all names used in the code
            used_names = set()
            for node in ast.walk(tree):
                if isinstance(node, ast.Name) and not isinstance(node.ctx, ast.Store):
                    used_names.add(node.id)
                elif isinstance(node, ast.Attribute):
                    # For chained attributes like module.submodule.function
                    current = node
                    parts = []
                    while isinstance(current, ast.Attribute):
                        parts.append(current.attr)
                        current = current.value
                    if isinstance(current, ast.Name):
                        parts.append(current.id)
                        # Check the root name
                        used_names.add(parts[-1])
            
            # Find unused imports
            unused = []
            for name, full_name in imports.items():
                if name not in used_names:
                    # Special cases for imports that might be used indirectly
                    if name in ['__annotations__', '__future__']:
                        continue
                    # Check if it's a module that might be used with getattr or similar
                    if f'"{name}"' in content or f"'{name}'" in content:
                        continue
                    unused.append(full_name)
            
            return unused
            
        except Exception as e:
            print(f"Error processing {file_path}: {e}")
            return []
    
    def scan_directory(self):
        """Scan the entire project for unused imports."""
        # Scan frontend files
        frontend_path = self.base_path / "frontend" / "src"
        if frontend_path.exists():
            for ext in ['*.ts', '*.tsx', '*.js', '*.jsx']:
                for file_path in frontend_path.rglob(ext):
                    # Skip node_modules and test files
                    if 'node_modules' in str(file_path) or '.test.' in str(file_path):
                        continue
                    
                    unused = self.find_unused_imports_ts(file_path)
                    if unused:
                        rel_path = file_path.relative_to(self.base_path)
                        self.results["frontend"][str(rel_path)] = unused
        
        # Scan backend files
        backend_path = self.base_path / "backend" / "app"
        if backend_path.exists():
            for file_path in backend_path.rglob('*.py'):
                # Skip __pycache__ directories
                if '__pycache__' in str(file_path):
                    continue
                
                unused = self.find_unused_imports_py(file_path)
                if unused:
                    rel_path = file_path.relative_to(self.base_path)
                    self.results["backend"][str(rel_path)] = unused
    
    def print_results(self):
        """Print the results grouped by directory."""
        print("=" * 80)
        print("UNUSED IMPORTS ANALYSIS")
        print("=" * 80)
        
        # Frontend results
        if self.results["frontend"]:
            print("\n## FRONTEND (TypeScript/JavaScript)")
            print("-" * 40)
            
            # Group by directory
            by_dir = {}
            for file_path, unused in sorted(self.results["frontend"].items()):
                dir_path = os.path.dirname(file_path)
                if dir_path not in by_dir:
                    by_dir[dir_path] = []
                by_dir[dir_path].append((file_path, unused))
            
            for dir_path, files in sorted(by_dir.items()):
                print(f"\n### {dir_path}/")
                for file_path, unused in files:
                    print(f"\n{file_path}:")
                    for imp in unused:
                        print(f"  - {imp}")
        else:
            print("\n## FRONTEND: No unused imports found!")
        
        # Backend results
        if self.results["backend"]:
            print("\n\n## BACKEND (Python)")
            print("-" * 40)
            
            # Group by directory
            by_dir = {}
            for file_path, unused in sorted(self.results["backend"].items()):
                dir_path = os.path.dirname(file_path)
                if dir_path not in by_dir:
                    by_dir[dir_path] = []
                by_dir[dir_path].append((file_path, unused))
            
            for dir_path, files in sorted(by_dir.items()):
                print(f"\n### {dir_path}/")
                for file_path, unused in files:
                    print(f"\n{file_path}:")
                    for imp in unused:
                        print(f"  - {imp}")
        else:
            print("\n## BACKEND: No unused imports found!")
        
        # Summary
        total_frontend = sum(len(unused) for unused in self.results["frontend"].values())
        total_backend = sum(len(unused) for unused in self.results["backend"].values())
        
        print("\n" + "=" * 80)
        print("SUMMARY")
        print("=" * 80)
        print(f"Frontend unused imports: {total_frontend}")
        print(f"Backend unused imports: {total_backend}")
        print(f"Total unused imports: {total_frontend + total_backend}")


if __name__ == "__main__":
    # Get the project root (parent of backend directory)
    project_root = Path(__file__).parent.parent
    
    finder = UnusedImportsFinder(project_root)
    finder.scan_directory()
    finder.print_results()