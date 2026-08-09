"""
Compatibility layer - stdlib-only fallbacks for external dependencies.

When running in environments without pip access (e.g., testing, CI without network),
this module provides basic replacements using only Python standard library.
"""

import re
import json
import urllib.request
import urllib.error
import urllib.parse
from html.parser import HTMLParser


def slugify(text):
    """Convert text to URL-friendly slug (stdlib replacement for python-slugify)."""
    text = text.lower().strip()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[\s_]+', '-', text)
    text = re.sub(r'-+', '-', text)
    text = text.strip('-')
    return text


def http_get(url, headers=None, timeout=15):
    """Simple HTTP GET using urllib (stdlib replacement for requests.get)."""
    if headers is None:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }

    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            data = response.read().decode("utf-8", errors="replace")
            return {"status_code": response.status, "text": data}
    except urllib.error.HTTPError as e:
        return {"status_code": e.code, "text": str(e)}
    except Exception as e:
        return {"status_code": 0, "text": str(e)}


def http_post(url, json_data=None, headers=None, timeout=60):
    """Simple HTTP POST using urllib (stdlib replacement for requests.post)."""
    if headers is None:
        headers = {"Content-Type": "application/json"}
    else:
        headers.setdefault("Content-Type", "application/json")

    data = json.dumps(json_data).encode("utf-8") if json_data else None
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")

    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            resp_data = response.read().decode("utf-8", errors="replace")
            return {
                "status_code": response.status,
                "text": resp_data,
                "json": json.loads(resp_data) if resp_data else {},
            }
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace") if e.fp else ""
        return {"status_code": e.code, "text": body, "json": {}}
    except Exception as e:
        return {"status_code": 0, "text": str(e), "json": {}}


def markdown_to_html(md_text):
    """
    Basic Markdown to HTML converter (stdlib replacement for markdown library).
    Handles: headings, bold, italic, links, lists, tables, code blocks, blockquotes, hr.
    """
    lines = md_text.split("\n")
    html_lines = []
    in_code_block = False
    in_list = False
    in_table = False
    table_header_done = False

    for line in lines:
        # Code blocks
        if line.strip().startswith("```"):
            if in_code_block:
                html_lines.append("</code></pre>")
                in_code_block = False
            else:
                html_lines.append("<pre><code>")
                in_code_block = True
            continue

        if in_code_block:
            html_lines.append(line)
            continue

        # Close list if not a list item
        if in_list and not line.strip().startswith(("-", "*", "1.", "2.", "3.", "4.", "5.", "6.", "7.", "8.", "9.")):
            html_lines.append("</ul>")
            in_list = False

        # Close table if empty line
        if in_table and not line.strip().startswith("|"):
            html_lines.append("</table>")
            in_table = False
            table_header_done = False

        # Headings
        if line.startswith("######"):
            html_lines.append(f"<h6>{_inline_format(line[6:].strip())}</h6>")
        elif line.startswith("#####"):
            html_lines.append(f"<h5>{_inline_format(line[5:].strip())}</h5>")
        elif line.startswith("####"):
            html_lines.append(f"<h4>{_inline_format(line[4:].strip())}</h4>")
        elif line.startswith("###"):
            html_lines.append(f"<h3>{_inline_format(line[3:].strip())}</h3>")
        elif line.startswith("##"):
            html_lines.append(f"<h2>{_inline_format(line[2:].strip())}</h2>")
        elif line.startswith("#"):
            html_lines.append(f"<h1>{_inline_format(line[1:].strip())}</h1>")

        # Horizontal rule
        elif line.strip() in ("---", "***", "___"):
            html_lines.append("<hr>")

        # Blockquote
        elif line.strip().startswith(">"):
            content = line.strip()[1:].strip()
            html_lines.append(f"<blockquote><p>{_inline_format(content)}</p></blockquote>")

        # Tables
        elif line.strip().startswith("|"):
            cells = [c.strip() for c in line.strip().strip("|").split("|")]

            # Skip separator row
            if all(re.match(r'^[-:]+$', c) for c in cells):
                continue

            if not in_table:
                html_lines.append("<table>")
                in_table = True
                tag = "th"
                table_header_done = False
            elif not table_header_done:
                tag = "th"
                table_header_done = True
            else:
                tag = "td"

            row = "".join(f"<{tag}>{_inline_format(c)}</{tag}>" for c in cells)
            html_lines.append(f"<tr>{row}</tr>")

            if tag == "th":
                table_header_done = True

        # Unordered list
        elif line.strip().startswith(("-", "*")) and len(line.strip()) > 1 and line.strip()[1] == " ":
            if not in_list:
                html_lines.append("<ul>")
                in_list = True
            content = line.strip()[2:].strip()
            html_lines.append(f"<li>{_inline_format(content)}</li>")

        # Ordered list
        elif re.match(r'^\d+\.\s', line.strip()):
            if not in_list:
                html_lines.append("<ul>")
                in_list = True
            content = re.sub(r'^\d+\.\s', '', line.strip())
            html_lines.append(f"<li>{_inline_format(content)}</li>")

        # Empty line
        elif not line.strip():
            html_lines.append("")

        # Regular paragraph
        else:
            html_lines.append(f"<p>{_inline_format(line)}</p>")

    # Close any open elements
    if in_list:
        html_lines.append("</ul>")
    if in_table:
        html_lines.append("</table>")
    if in_code_block:
        html_lines.append("</code></pre>")

    return "\n".join(html_lines)


def _inline_format(text):
    """Apply inline markdown formatting (bold, italic, links, code)."""
    # Code (inline)
    text = re.sub(r'`([^`]+)`', r'<code>\1</code>', text)
    # Bold
    text = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', text)
    text = re.sub(r'__([^_]+)__', r'<strong>\1</strong>', text)
    # Italic
    text = re.sub(r'\*([^*]+)\*', r'<em>\1</em>', text)
    text = re.sub(r'_([^_]+)_', r'<em>\1</em>', text)
    # Links
    text = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'<a href="\2">\1</a>', text)
    # Images
    text = re.sub(r'!\[([^\]]*)\]\(([^)]+)\)', r'<img src="\2" alt="\1">', text)
    return text


def render_template(template_str, context):
    """
    Simple template renderer (stdlib replacement for Jinja2).
    Supports: {{ variable }}, {% for %}, {% if %}, {% block %} (simplified).
    """
    result = template_str

    # Handle extends (just remove it - we process templates inline)
    result = re.sub(r'{%\s*extends\s+"[^"]+"\s*%}', '', result)

    # Handle block definitions (just render content, ignore block names)
    result = re.sub(r'{%\s*block\s+\w+\s*%}', '', result)
    result = re.sub(r'{%\s*endblock\s*%}', '', result)

    # Handle for loops (simple single-level)
    def handle_for(match):
        var_name = match.group(1)
        iter_name = match.group(2)
        body = match.group(3)

        items = context.get(iter_name, [])
        output = []
        for item in items:
            loop_context = {**context, var_name: item}
            rendered = _substitute_vars(body, loop_context)
            output.append(rendered)
        return "".join(output)

    result = re.sub(
        r'{%\s*for\s+(\w+)\s+in\s+(\w+)\s*%}(.*?){%\s*endfor\s*%}',
        handle_for,
        result,
        flags=re.DOTALL,
    )

    # Handle if statements (simple truthy check)
    def handle_if(match):
        condition = match.group(1).strip()
        body = match.group(2)
        negate = condition.startswith("not ")
        if negate:
            condition = condition[4:].strip()
        value = context.get(condition)
        is_true = bool(value)
        if negate:
            is_true = not is_true
        return body if is_true else ""

    result = re.sub(
        r'{%\s*if\s+(.+?)\s*%}(.*?){%\s*endif\s*%}',
        handle_if,
        result,
        flags=re.DOTALL,
    )

    # Substitute variables
    result = _substitute_vars(result, context)

    return result


def _substitute_vars(text, context):
    """Replace {{ variable }} and {{ obj.attr }} with values from context."""
    def replace_var(match):
        expr = match.group(1).strip()

        # Handle filters like | safe, | lower
        parts = expr.split("|")
        var_expr = parts[0].strip()

        # Handle dot notation
        if "." in var_expr:
            obj_name, attr = var_expr.split(".", 1)
            obj = context.get(obj_name, {})
            if isinstance(obj, dict):
                value = obj.get(attr, "")
            else:
                value = getattr(obj, attr, "")
        else:
            value = context.get(var_expr, "")

        # Apply filters
        for filt in parts[1:]:
            filt = filt.strip()
            if filt == "safe":
                pass  # Don't escape
            elif filt == "lower":
                value = str(value).lower()

        return str(value)

    return re.sub(r'\{\{\s*(.+?)\s*\}\}', replace_var, text)
