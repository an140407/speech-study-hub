import type { ReactNode } from "react";
import { HighlightableBlock, useHighlights } from "./highlight";

/** Tiny markdown renderer: headings, bullet/numbered lists, bold, paragraphs.
 *  Parágrafos e itens de lista são grifáveis (por bloco); títulos não são. */
export function SimpleMarkdown({ text, topicId, maskMode }: { text: string; topicId: string; maskMode: boolean }) {
  const { rangesFor, onSelect, onRemove } = useHighlights(topicId, "resumo", undefined, maskMode);

  const lines = text.replace(/\r/g, "").split("\n");
  const out: ReactNode[] = [];
  let list: { type: "ul" | "ol"; items: string[] } | null = null;
  let para: string[] = [];
  let k = 0;
  let blockIndex = 0;

  const flushList = () => {
    if (!list) return;
    const Tag = list.type;
    out.push(
      <Tag key={k++}>
        {list.items.map((it) => {
          const bi = blockIndex++;
          return <HighlightableBlock key={bi} as="li" blockIndex={bi} text={it} ranges={rangesFor(bi)} onSelect={onSelect} onRemove={onRemove} />;
        })}
      </Tag>,
    );
    list = null;
  };
  const flushPara = () => {
    if (para.length === 0) return;
    const bi = blockIndex++;
    const text = para.join(" ");
    out.push(<HighlightableBlock key={k++} as="p" blockIndex={bi} text={text} ranges={rangesFor(bi)} onSelect={onSelect} onRemove={onRemove} />);
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
      const content = h[2]!.replace(/\*\*/g, "");
      const clearSel = () => window.getSelection()?.removeAllRanges();
      out.push(
        lvl === 1 ? (
          <h1 key={k++} onMouseUp={clearSel}>{content}</h1>
        ) : lvl === 2 ? (
          <h2 key={k++} onMouseUp={clearSel}>{content}</h2>
        ) : (
          <h3 key={k++} onMouseUp={clearSel}>{content}</h3>
        ),
      );
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