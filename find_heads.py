import os
import re

versions_dir = "backend/alembic/versions"
revisions = {} # id -> {down_revision, file}

# Regex to find revision and down_revision
# Matches: revision = '123' OR revision: str = '123'
rev_pattern = re.compile(r"^revision\s*(?::\s*[^=]+)?\s*=\s*['\"]([^'\"]+)['\"]", re.MULTILINE)
# Matches: down_revision = ...
down_rev_pattern = re.compile(r"^down_revision\s*(?::\s*[^=]+)?\s*=\s*(?:['\"]([^'\"]+)['\"]|\(([^)]+)\)|None)", re.MULTILINE)

print(f"Scanning {versions_dir}...")

for filename in os.listdir(versions_dir):
    if not filename.endswith(".py") or filename == "__init__.py":
        continue
    
    with open(os.path.join(versions_dir, filename), 'r', encoding='utf-8') as f:
        content = f.read()
        
        rev_match = rev_pattern.search(content)
        if not rev_match:
            print(f"Skipping {filename}: No revision ID found")
            continue
        rev_id = rev_match.group(1)
        
        down_rev_match = down_rev_pattern.search(content)
        down_rev = []
        if down_rev_match:
            if down_rev_match.group(1): # Single revision
                down_rev = [down_rev_match.group(1)]
            elif down_rev_match.group(2): # Tuple
                # clean up tuple string
                raw_tuple = down_rev_match.group(2)
                # Split by comma and strip quotes
                parts = raw_tuple.split(',')
                for p in parts:
                    clean_p = p.strip().strip("'").strip('"')
                    if clean_p:
                        down_rev.append(clean_p)
        
        revisions[rev_id] = {'down': down_rev, 'file': filename}

# Find heads: Revisions that are NOT down_revision of any other revision
parents = set()
for r, data in revisions.items():
    for p in data['down']:
        parents.add(p)

heads = set(revisions.keys()) - parents

with open("heads_report.txt", "w", encoding="utf-8") as out:
    out.write("-" * 30 + "\n")
    out.write(f"Total Revisions found: {len(revisions)}\n")
    out.write("-" * 30 + "\n")
    out.write("Heads (Revisions with no children):\n")
    for h in heads:
        out.write(f"- ID: {h}\n")
        out.write(f"  File: {revisions[h]['file']}\n")
    out.write("-" * 30 + "\n")
    
print("Report written to heads_report.txt")
