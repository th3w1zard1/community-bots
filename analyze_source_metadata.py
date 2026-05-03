#!/usr/bin/env python3
"""Analyze and prepare source binary metadata for propagation."""

import json
from collections import defaultdict
from pathlib import Path

# Path to extracted source functions
FUNCTIONS_FILE = Path(
    "c:/Users/boden/AppData/Roaming/Code/User/workspaceStorage/e2b743486fd0d43a793d7692b81dd387/GitHub.copilot-chat/chat-session-resources/fe015842-ba80-42f1-83c0-df3fe08a45fb/toolu_bdrk_01Rgou1k9JBMvYV54ziZonnQ__vscode-1777126684698/content.json"
)


def main():
    print("=" * 70)
    print("SOURCE METADATA ANALYSIS")
    print("=" * 70)

    # Load source functions
    with open(FUNCTIONS_FILE) as f:
        functions = json.load(f)

    print(f"\nTotal functions extracted: {len(functions)}")

    # Analyze structure
    if functions:
        print("\nSample function structure:")
        sample = functions[0]
        for key, val in sample.items():
            val_str = str(val)[:100]
            print(f"  {key}: {val_str}")

    # Analyze namespaces
    namespaces = defaultdict(int)
    names_by_ns = defaultdict(list)

    for func in functions:
        ns = func.get("namespace", "Global")
        name = func.get("name", "Unknown")
        address = func.get("address", "")
        namespaces[ns] += 1
        names_by_ns[ns].append((name, address))

    print(f"\n{'=' * 70}")
    print("NAMESPACE DISTRIBUTION:")
    print("=" * 70)
    for ns, count in sorted(namespaces.items(), key=lambda x: -x[1])[:20]:
        print(f"  {ns}: {count:4d} functions")

    # Save organized metadata
    metadata = {
        "total_functions": len(functions),
        "functions_by_namespace": {ns: names_by_ns[ns] for ns in sorted(namespaces.keys())},
        "all_functions": functions,
    }

    output_file = Path("source_metadata_organized.json")
    with open(output_file, "w") as f:
        json.dump(metadata, f, indent=2)

    print(f"\n[✓] Saved organized metadata to: {output_file}")
    print(f"    - Total classes: {len(namespaces)}")
    print(f"    - Total functions: {len(functions)}")


if __name__ == "__main__":
    main()
