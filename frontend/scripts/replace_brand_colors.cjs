const fs = require('fs');
const path = require('path');

const targetDirs = [
  path.join(__dirname, '../src/pages/app'),
  path.join(__dirname, '../src/components')
];

const classMap = {
  'bg-brand-darkest': 'bg-[#000000]',
  'bg-brand-dark': 'bg-[#0A0A0A]',
  'border-brand-border-dark': 'border-[#1A1A1A]',
  'bg-brand-nav-active': 'bg-[#111111]'
};

let filesModified = 0;

function processDirectory(directory) {
  if (!fs.existsSync(directory)) return;
  
  const files = fs.readdirSync(directory);
  
  for (const file of files) {
    const fullPath = path.join(directory, file);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      processDirectory(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts') || fullPath.endsWith('.jsx') || fullPath.endsWith('.js')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let modified = false;
      
      for (const [oldClass, newClass] of Object.entries(classMap)) {
        // We use split/join to replace all occurrences globally
        if (content.includes(oldClass)) {
          content = content.split(oldClass).join(newClass);
          modified = true;
        }
      }
      
      if (modified) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`Updated brand classes in: ${fullPath}`);
        filesModified++;
      }
    }
  }
}

console.log('Starting brand class replacement...');
targetDirs.forEach(dir => processDirectory(dir));
console.log(`Finished! Modified ${filesModified} files.`);
