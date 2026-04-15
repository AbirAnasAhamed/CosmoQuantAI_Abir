import os

def count_lines(directory, extensions=None, exclude_dirs=None):
    if extensions is None:
        extensions = ['.py', '.js', '.ts', '.tsx', '.html', '.css', '.json', '.yml', '.yaml']
    if exclude_dirs is None:
        exclude_dirs = ['node_modules', '.git', '__pycache__', 'venv', 'dist', 'build', '.next']

    total_lines = 0
    file_counts = {}

    for root, dirs, files in os.walk(directory):
        # Exclude directories
        dirs[:] = [d for d in dirs if d not in exclude_dirs]

        for file in files:
            ext = os.path.splitext(file)[1]
            if ext in extensions:
                file_path = os.path.join(root, file)
                # Skip package-lock.json to avoid inflated counts
                if file == 'package-lock.json':
                    continue
                try:
                    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                        lines = sum(1 for line in f)
                        total_lines += lines
                        file_counts[ext] = file_counts.get(ext, 0) + lines
                except Exception as e:
                    print(f"Error reading {file_path}: {e}")

    return total_lines, file_counts

if __name__ == "__main__":
    total, breakdown = count_lines('.')
    print(f"Total Lines of Code: {total}")
    print("\nBreakdown by extension:")
    for ext, count in sorted(breakdown.items(), key=lambda x: x[1], reverse=True):
        print(f"{ext}: {count}")
