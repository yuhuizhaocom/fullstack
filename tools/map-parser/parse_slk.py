"""Minimal SLK reader for Warcraft III object-editor files (research tool)."""


def parse_slk(path):
    cells = {}
    max_row = 0
    max_col = 0
    last_row = 0
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            line = line.rstrip("\r\n")
            if not line.startswith("C;"):
                continue
            row = col = None
            value = None
            for part in line.split(";"):
                if part.startswith("Y") and part[1:].isdigit():
                    row = int(part[1:])
                elif part.startswith("X") and part[1:].isdigit():
                    col = int(part[1:])
                elif part.startswith("K"):
                    raw = part[1:]
                    if raw.startswith('"') and raw.endswith('"'):
                        value = raw[1:-1]
                    else:
                        value = raw
            if row is not None:
                last_row = row
            row = last_row
            if col is None:
                continue
            cells[(row, col)] = value
            max_row = max(max_row, row)
            max_col = max(max_col, col)
    headers = {}
    for (r, c), v in cells.items():
        if r == 1:
            headers[c] = v
    columns = [headers.get(c, f"col{c}") for c in range(1, max_col + 1)]
    rows = {}
    for r in range(2, max_row + 1):
        key = cells.get((r, 1))
        if not key:
            continue
        row = {}
        for c in range(1, max_col + 1):
            name = headers.get(c)
            if name:
                row[name] = cells.get((r, c))
        rows[key] = row
    return columns, rows
