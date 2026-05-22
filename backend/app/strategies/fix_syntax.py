import re

def fix_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Find cases of literal newlines inside f-strings
    # Like: f"something\n"
    # where the newline is actual \n
    content = re.sub(r'f"(.*?)\n"', r'f"\1\\n"', content)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

fix_file(r'd:\CosmoQuantAI_Abir\backend\app\strategies\wall_hunter_futures.py')
fix_file(r'd:\CosmoQuantAI_Abir\backend\app\strategies\wall_hunter_bot.py')
print("Fixed files.")
