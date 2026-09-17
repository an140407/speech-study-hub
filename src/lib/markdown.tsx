import type { ReactNode } from "react";

function inline(text: string, key: number): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <span key={key}>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : p,
      )}
    </span>
  );
}

/** Tiny markdown renderer: headings, bullet/numbered lists, bold, paragraphs. */
export function SimpleMarkdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const out: ReactNode[] = [];
  let list: { type: "ul" | "ol"; items: string[] } | null = null;
  let para: string[] = [];
  let k = 0;

  const flushList = () => {
    if (!list) return;
    const Tag = list.type;
    out.push(<Tag key={k++}>{list.items.map((it, i) => <li key={i}>{inline(it, i)}</li>)}</Tag>);
    list = null;
  };
  const flushPara = () => {
    if (para.length === 0) return;
    out.push(<p key={k++}>{inline(para.join(" "), 0)}</p>);
    para = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    const ul = line.match(/^[-*•]\s+(.*)$/);
    const ol = line.match(/^\d+[.)]\s+(.*)$/);
    if (h) {
      flushList();
      flushPara();
      const lvl = h[1]!.length;
      const content = inline(h[2]!, 0);
      out.push(lvl === 1 ? <h1 key={k++}>{content}</h1> : lvl === 2 ? <h2 key={k++}>{content}</h2> : <h3 key={k++}>{content}</h3>);
    } else if (ul || ol) {
      flushPara();
      const type = ul ? "ul" : "ol";
      const item = (ul ?? ol)![1]!;
      if (!list || list.type !== type) {
        flushList();
        list = { type, items: [] };
      }
      list.items.push(item);
    } else if (line === "") {
      flushList();
      flushPara();
    } else {
      flushList();
      para.push(line);
    }
  }
  flushList();
  flushPara();
  return <div className="prose-study">{out}</div>;
}
