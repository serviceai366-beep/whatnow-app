"""Execute simple Python code cells in a notebook without third-party packages."""

from __future__ import annotations

import ast
import contextlib
import io
import json
import sys
from pathlib import Path


def execute(path: Path) -> None:
    notebook = json.loads(path.read_text(encoding="utf-8"))
    namespace: dict[str, object] = {"__name__": "__main__"}
    execution_count = 0
    for cell in notebook.get("cells", []):
        if cell.get("cell_type") != "code":
            continue
        execution_count += 1
        source = "".join(cell.get("source", []))
        tree = ast.parse(source, filename=str(path), mode="exec")
        output = io.StringIO()
        result = None
        with contextlib.redirect_stdout(output):
            if tree.body and isinstance(tree.body[-1], ast.Expr):
                prefix = ast.Module(body=tree.body[:-1], type_ignores=[])
                exec(compile(prefix, str(path), "exec"), namespace)
                result = eval(compile(ast.Expression(tree.body[-1].value), str(path), "eval"), namespace)
            else:
                exec(compile(tree, str(path), "exec"), namespace)
        outputs: list[dict[str, object]] = []
        stdout = output.getvalue()
        if stdout:
            outputs.append({"name": "stdout", "output_type": "stream", "text": stdout.splitlines(keepends=True)})
        if result is not None:
            outputs.append({
                "data": {"text/plain": repr(result)},
                "execution_count": execution_count,
                "metadata": {},
                "output_type": "execute_result",
            })
        cell["execution_count"] = execution_count
        cell["outputs"] = outputs
    path.write_text(json.dumps(notebook, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


if __name__ == "__main__":
    execute(Path(sys.argv[1]))
