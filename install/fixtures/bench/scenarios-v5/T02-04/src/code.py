# CSV parser
def parse(line):
    # BUG (embedded_quote_escape): embedded "" inside quoted field not handled
    if not line: return []
    out = []
    cur = ''
    in_quote = False
    for ch in line:
        if ch == '"':
            in_quote = not in_quote
        elif ch == ',' and not in_quote:
            out.append(cur); cur = ''
        else:
            cur += ch
    out.append(cur)
    return out
