const fs = require('fs');
const path = require('path');

function fixImports(dir) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory() && !file.includes('node_modules') && !file.startsWith('.')) {
      fixImports(filePath);
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      let content = fs.readFileSync(filePath, 'utf8');
      
      // Replace @/ imports with relative imports
      content = content.replace(/from ['"]@\//g, "from '../");
      content = content.replace(/import ['"]@\//g, "import '../");
      
      // Adjust relative paths based on depth
      const depth = filePath.split('/src/')[1]?.split('/').length - 1 || 0;
      if (depth > 1) {
        for (let i = 1; i < depth; i++) {
          content = content.replace(/from '\.\.\//g, "from '../../");
          content = content.replace(/import '\.\.\//g, "import '../../");
        }
      }
      
      fs.writeFileSync(filePath, content);
      console.log(`Fixed imports in: ${filePath}`);
    }
  });
}

// Run from src directory
fixImports('./src');
console.log('Import paths fixed!');