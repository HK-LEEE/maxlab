#!/usr/bin/env python3
"""
MaxLab Dead Code Analyzer
Detects and optionally removes unused imports, commented code, and dead functions.
Usage: python scripts/dead-code-analyzer.py [--remove] [--path PATH]
"""

import os
import re
import ast
import argparse
from pathlib import Path
from typing import List, Dict, Set, Tuple
import json

class DeadCodeAnalyzer:
    def __init__(self, project_root: str):
        self.project_root = Path(project_root)
        self.issues = []
        self.stats = {
            'files_analyzed': 0,
            'unused_imports': 0,
            'commented_code_blocks': 0,
            'large_comment_blocks': 0,
            'potential_dead_functions': 0
        }
    
    def analyze_typescript_file(self, file_path: Path) -> List[Dict]:
        """Analyze TypeScript/TSX files for dead code."""
        issues = []
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
                lines = content.splitlines()
        except Exception as e:
            return [{'type': 'error', 'message': f"Could not read {file_path}: {e}"}]
        
        # Check for unused imports
        unused_imports = self._find_unused_imports_ts(content, lines)
        issues.extend(unused_imports)
        
        # Check for large commented code blocks
        commented_blocks = self._find_commented_code_blocks(lines)
        issues.extend(commented_blocks)
        
        return issues
    
    def _find_unused_imports_ts(self, content: str, lines: List[str]) -> List[Dict]:
        """Find potentially unused imports in TypeScript files."""
        issues = []
        import_pattern = re.compile(r'import\s+(?:\{([^}]+)\}|\*\s+as\s+(\w+)|(\w+))\s+from\s+[\'"]([^\'"]+)[\'"]')
        
        for i, line in enumerate(lines):
            match = import_pattern.search(line.strip())
            if match:
                # Extract imported names
                named_imports = match.group(1)
                namespace_import = match.group(2)
                default_import = match.group(3)
                module_name = match.group(4)
                
                imported_names = []
                if named_imports:
                    # Split and clean named imports
                    imported_names.extend([name.strip() for name in named_imports.split(',')])
                if namespace_import:
                    imported_names.append(namespace_import)
                if default_import:
                    imported_names.append(default_import)
                
                # Check if any imported name is used in the file
                for name in imported_names:
                    if name and not self._is_name_used_in_content(name, content, line):
                        issues.append({
                            'type': 'unused_import',
                            'line': i + 1,
                            'content': line.strip(),
                            'unused_name': name,
                            'module': module_name,
                            'severity': 'medium'
                        })
                        self.stats['unused_imports'] += 1
        
        return issues
    
    def _is_name_used_in_content(self, name: str, content: str, import_line: str) -> bool:
        """Check if an imported name is actually used in the file content."""
        # Remove the import line from content to avoid false positives
        content_without_import = content.replace(import_line, '')
        
        # Look for various usage patterns
        usage_patterns = [
            rf'\b{re.escape(name)}\b',  # Direct usage
            rf'<{re.escape(name)}\b',   # JSX component usage
            rf'{re.escape(name)}\.',    # Property access
            rf'{re.escape(name)}\(',    # Function call
        ]
        
        for pattern in usage_patterns:
            if re.search(pattern, content_without_import):
                return True
        
        return False
    
    def _find_commented_code_blocks(self, lines: List[str]) -> List[Dict]:
        """Find large blocks of commented code that might be dead."""
        issues = []
        in_comment_block = False
        block_start = 0
        block_lines = 0
        
        for i, line in enumerate(lines):
            stripped = line.strip()
            
            # Detect start of comment block
            if stripped.startswith('//') or stripped.startswith('/*') or stripped.startswith('{/*'):
                if not in_comment_block:
                    in_comment_block = True
                    block_start = i
                    block_lines = 1
                else:
                    block_lines += 1
            # Detect end of comment block
            elif stripped.endswith('*/') or stripped.endswith('*/}'):
                if in_comment_block:
                    block_lines += 1
                    if block_lines >= 5:  # Large comment block
                        issues.append({
                            'type': 'large_comment_block',
                            'line_start': block_start + 1,
                            'line_end': i + 1,
                            'block_size': block_lines,
                            'severity': 'low'
                        })
                        self.stats['large_comment_blocks'] += 1
                in_comment_block = False
                block_lines = 0
            # Continue comment block
            elif in_comment_block and (stripped.startswith('//') or stripped.startswith('*') or 
                                     'AlarmNotification' in stripped or '<' in stripped):
                block_lines += 1
            # Non-comment line breaks the block
            elif in_comment_block and stripped:
                in_comment_block = False
                block_lines = 0
        
        return issues
    
    def analyze_python_file(self, file_path: Path) -> List[Dict]:
        """Analyze Python files for dead code."""
        issues = []
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
        except Exception as e:
            return [{'type': 'error', 'message': f"Could not read {file_path}: {e}"}]
        
        # Try to parse as AST
        try:
            tree = ast.parse(content)
            # Find unused imports
            unused_imports = self._find_unused_imports_python(tree, content)
            issues.extend(unused_imports)
        except SyntaxError:
            # File has syntax errors, skip AST analysis
            pass
        
        return issues
    
    def _find_unused_imports_python(self, tree: ast.AST, content: str) -> List[Dict]:
        """Find unused imports in Python files."""
        issues = []
        imported_names = set()
        used_names = set()
        
        # Collect all imported names
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    imported_names.add(alias.asname or alias.name)
            elif isinstance(node, ast.ImportFrom):
                for alias in node.names:
                    imported_names.add(alias.asname or alias.name)
        
        # Collect all used names (simplified)
        for node in ast.walk(tree):
            if isinstance(node, ast.Name):
                used_names.add(node.id)
            elif isinstance(node, ast.Attribute):
                # For attribute access like 'module.function'
                if isinstance(node.value, ast.Name):
                    used_names.add(node.value.id)
        
        # Find unused imports
        unused = imported_names - used_names
        for name in unused:
            issues.append({
                'type': 'unused_import',
                'unused_name': name,
                'severity': 'medium'
            })
            self.stats['unused_imports'] += 1
        
        return issues
    
    def analyze_directory(self, directory: Path, remove_dead_code: bool = False) -> None:
        """Analyze all files in a directory recursively."""
        for file_path in directory.rglob('*'):
            if file_path.is_file() and not self._should_skip_file(file_path):
                self.stats['files_analyzed'] += 1
                
                if file_path.suffix in ['.ts', '.tsx', '.js', '.jsx']:
                    issues = self.analyze_typescript_file(file_path)
                elif file_path.suffix == '.py':
                    issues = self.analyze_python_file(file_path)
                else:
                    continue
                
                if issues:
                    self.issues.append({
                        'file': str(file_path.relative_to(self.project_root)),
                        'issues': issues
                    })
                    
                    if remove_dead_code:
                        self._apply_fixes(file_path, issues)
    
    def _should_skip_file(self, file_path: Path) -> bool:
        """Check if file should be skipped during analysis."""
        skip_patterns = [
            'node_modules',
            '.venv',
            '__pycache__',
            '.git',
            'dist',
            'build',
            '.test.',
            '.spec.',
            'migrations'
        ]
        
        path_str = str(file_path)
        return any(pattern in path_str for pattern in skip_patterns)
    
    def _apply_fixes(self, file_path: Path, issues: List[Dict]) -> None:
        """Apply automatic fixes for safe issues."""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                lines = f.readlines()
            
            # Sort issues by line number in reverse order to avoid line number shifts
            import_issues = [issue for issue in issues if issue.get('type') == 'unused_import']
            import_issues.sort(key=lambda x: x.get('line', 0), reverse=True)
            
            modified = False
            for issue in import_issues:
                if issue.get('line'):
                    line_idx = issue['line'] - 1
                    if 0 <= line_idx < len(lines):
                        # Remove the unused import line
                        lines.pop(line_idx)
                        modified = True
                        print(f"  Removed unused import: {issue['unused_name']} from {file_path}")
            
            if modified:
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.writelines(lines)
        
        except Exception as e:
            print(f"Error applying fixes to {file_path}: {e}")
    
    def generate_report(self) -> str:
        """Generate a comprehensive dead code report."""
        report = []
        report.append("# MaxLab Dead Code Analysis Report\n")
        report.append(f"Generated: {__import__('datetime').datetime.now().isoformat()}\n")
        
        # Statistics
        report.append("## Summary Statistics")
        report.append(f"- Files analyzed: {self.stats['files_analyzed']}")
        report.append(f"- Unused imports found: {self.stats['unused_imports']}")
        report.append(f"- Large comment blocks: {self.stats['large_comment_blocks']}")
        report.append("")
        
        # Detailed issues
        if self.issues:
            report.append("## Detailed Issues\n")
            for file_data in self.issues:
                report.append(f"### {file_data['file']}\n")
                for issue in file_data['issues']:
                    if issue['type'] == 'unused_import':
                        report.append(f"- **Unused import** (line {issue.get('line', '?')}): `{issue['unused_name']}` from `{issue.get('module', 'unknown')}`")
                    elif issue['type'] == 'large_comment_block':
                        report.append(f"- **Large comment block** (lines {issue['line_start']}-{issue['line_end']}): {issue['block_size']} lines")
                report.append("")
        else:
            report.append("## No Issues Found! 🎉\nYour code is clean!")
        
        return "\n".join(report)

def main():
    parser = argparse.ArgumentParser(description="MaxLab Dead Code Analyzer")
    parser.add_argument('--remove', action='store_true', help='Remove dead code automatically')
    parser.add_argument('--path', default='.', help='Path to analyze (default: current directory)')
    parser.add_argument('--output', help='Output report to file')
    
    args = parser.parse_args()
    
    project_root = os.path.abspath(args.path)
    analyzer = DeadCodeAnalyzer(project_root)
    
    print(f"🔍 Analyzing dead code in: {project_root}")
    if args.remove:
        print("⚠️  REMOVE MODE: Dead code will be automatically removed")
    else:
        print("🔍 ANALYSIS MODE: Dead code will be reported only")
    
    print("\nAnalyzing files...")
    analyzer.analyze_directory(Path(project_root), remove_dead_code=args.remove)
    
    # Generate report
    report = analyzer.generate_report()
    
    if args.output:
        with open(args.output, 'w') as f:
            f.write(report)
        print(f"📄 Report saved to: {args.output}")
    else:
        print("\n" + "="*60)
        print(report)
    
    print(f"\n✅ Analysis complete. Analyzed {analyzer.stats['files_analyzed']} files.")
    
    if analyzer.stats['unused_imports'] > 0:
        print(f"🧹 Found {analyzer.stats['unused_imports']} unused imports")
        if not args.remove:
            print("   Run with --remove to automatically fix them")

if __name__ == "__main__":
    main()