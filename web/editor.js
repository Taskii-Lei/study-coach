(function (root) {
  'use strict';
  const WIDTH = 4;
  // Strip comments while respecting ordinary Python string literals.
  function codeBeforeComment(line) {
    let quote = '', escaped = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (escaped) { escaped = false; continue; }
      if (c === '\\' && quote) { escaped = true; continue; }
      if (quote) { if (c === quote) quote = ''; }
      else if (c === '"' || c === "'") quote = c;
      else if (c === '#') return line.slice(0, i);
    }
    return line;
  }
  function edit(value, start, end, key, shift = false, python = true) {
    const lineStart = start === 0 ? 0 : value.lastIndexOf('\n', start - 1) + 1;
    if (key === 'Enter' && python) {
      const before = value.slice(lineStart, start);
      const indent = before.match(/^[\t ]*/)[0];
      const code = codeBeforeComment(before).trimEnd();
      const text = '\n' + indent + (code.endsWith(':') ? ' '.repeat(WIDTH) : '');
      return {from: start, to: end, text, start: start + text.length, end: start + text.length};
    }
    if (key !== 'Tab') return null;
    if (!shift && start === end) {
      const text = ' '.repeat(WIDTH - (start - lineStart) % WIDTH);
      return {from: start, to: end, text, start: start + text.length, end: start + text.length};
    }
    const last = end > start && value[end - 1] === '\n' ? end - 1 : end;
    const boundary = value.indexOf('\n', last);
    const lineEnd = boundary === -1 ? value.length : boundary;
    const lines = value.slice(lineStart, lineEnd).split('\n');
    const changes = lines.map(line => shift ? -(line.startsWith('\t') ? 1 : Math.min(WIDTH, line.match(/^ */)[0].length)) : WIDTH);
    const text = lines.map((line, i) => shift ? line.slice(-changes[i]) : ' '.repeat(WIDTH) + line).join('\n');
    const first = Math.max(lineStart, start + changes[0]);
    const finish = start === end ? first : Math.max(first, end + changes.reduce((a, b) => a + b, 0));
    return {from: lineStart, to: lineEnd, text, start: first, end: finish};
  }
  const api = {edit};
  if (typeof module !== 'undefined') module.exports = api;
  else root.CoachEditor = api;
})(typeof window === 'undefined' ? globalThis : window);
