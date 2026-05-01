const fs = require('fs');
const path = require('path');

const targetDirs = [
  path.join(__dirname, '../src/pages/app'),
  path.join(__dirname, '../src/components'),
  path.join(__dirname, '../src/layouts')
];

const colorMap = {
  '#0B1120': '#000000',
  '#0F172A': '#0A0A0A',
  '#1e293b': '#141414',
  '#1E293B': '#141414',
  '#050B14': '#000000',
  '#070F20': '#050505',
  '#050A15': '#000000',
  '#050A14': '#000000',
  '#020610': '#000000',
  '#0a0f1c': '#000000',
  '#161e2e': '#111111'
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
      
      for (const [oldColor, newColor] of Object.entries(colorMap)) {
        // Use regex with global flag to replace all occurrences, case insensitive to catch #0f172a
        const regex = new RegExp(oldColor, 'gi');
        if (regex.test(content)) {
          content = content.replace(regex, newColor);
          modified = true;
        }
      }
      
      if (modified) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`Updated colors in: ${fullPath}`);
        filesModified++;
      }
    }
  }
}

console.log('Starting global color replacement...');
targetDirs.forEach(dir => processDirectory(dir));
console.log(`Finished! Modified ${filesModified} files.`);
