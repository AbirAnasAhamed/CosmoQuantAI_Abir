const fs = require('fs'); 
const code = fs.readFileSync('src/pages/app/ModelTrainingStudio.tsx', 'utf8'); 
let stack = []; 
let lines = code.split('\n'); 
for(let i=0; i<lines.length; i++) { 
    for(let j=0; j<lines[i].length; j++) { 
        let c = lines[i][j]; 
        if (c === '{' || c === '(' || c === '[') stack.push({c, line: i+1}); 
        else if (c === '}' || c === ')' || c === ']') { 
            let last = stack.pop(); 
            if (!last) console.log(`Extra ${c} at line ${i+1}`); 
            else if ((c === '}' && last.c !== '{') || (c === ')' && last.c !== '(') || (c === ']' && last.c !== '[')) console.log(`Mismatch at line ${i+1}: expected match for ${last.c} from line ${last.line}, but found ${c}`); 
        } 
    } 
} 
if (stack.length > 0) console.log('Unclosed: ', stack.map(s => `${s.c} at line ${s.line}`));
