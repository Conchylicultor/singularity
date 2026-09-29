"""Summary statistics of a list of numbers, computed with numpy.

The runPython contract: ONE JSON document on stdin, ONE on stdout, anything
else (progress, warnings) on stderr.
"""

import json
import sys

import numpy as np


def main() -> None:
    request = json.load(sys.stdin)
    values = np.asarray(request["values"], dtype=float)
    print(f"summarizing {values.size} values", file=sys.stderr)
    json.dump(
        {
            "count": int(values.size),
            "mean": float(values.mean()),
            "std": float(values.std()),
            "numpy": np.__version__,
        },
        sys.stdout,
    )


if __name__ == "__main__":
    main()
