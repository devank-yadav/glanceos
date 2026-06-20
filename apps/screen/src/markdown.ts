// Safe inline-markdown subset for text blocks: **bold**, *italic*, [text](url).
// Builds DOM nodes only — NEVER innerHTML — so untrusted board content can't
// inject markup or scripts onto a live screen. Anchors are emitted only for
// http(s) URLs; any other scheme (javascript:, data:, …) renders as plain text.

const TOKEN = /(\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)\s]+)\))/g;

function renderLine(line: string, parent: Node): void {
  let last = 0;
  let m: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(line))) {
    if (m.index > last) parent.appendChild(document.createTextNode(line.slice(last, m.index)));
    if (m[2] !== undefined) {
      const s = document.createElement("strong");
      s.textContent = m[2];
      parent.appendChild(s);
    } else if (m[3] !== undefined) {
      const e = document.createElement("em");
      e.textContent = m[3];
      parent.appendChild(e);
    } else if (m[4] !== undefined && m[5] !== undefined) {
      const label = m[4];
      const href = m[5];
      if (/^https?:\/\//i.test(href)) {
        const a = document.createElement("a");
        a.href = href;
        a.rel = "noopener noreferrer";
        a.textContent = label;
        parent.appendChild(a);
      } else {
        parent.appendChild(document.createTextNode(label)); // unsafe scheme → plain text, no link
      }
    }
    last = TOKEN.lastIndex;
  }
  if (last < line.length) parent.appendChild(document.createTextNode(line.slice(last)));
}

/** Render a multi-line markdown string into `parent` (newlines → <br>). */
export function renderInlineMarkdown(text: string, parent: HTMLElement): void {
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (i > 0) parent.appendChild(document.createElement("br"));
    renderLine(line, parent);
  });
}
