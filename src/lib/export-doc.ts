/**
 * Exportar o tópico: monta um HTML simples com as partes escolhidas (o mesmo vale para
 * o PDF, impresso pelo navegador) e converte esse HTML num .docx de verdade (Word),
 * sem biblioteca de documentos: só o jszip, que já está no projeto.
 * Roda no navegador (usa DOMParser).
 */

import {
  layoutFlow,
  NODE_KIND_LABEL,
  roughMeasure,
  FLOW_KINDS,
  type Flow,
  type FlowKind,
} from "./flow";
import { phraseParts, type Mnemonic } from "./mnemonics";
import { resolveNotes, type NoteRow } from "./notes";

export type ExportPart =
  | "resumo"
  | "notas"
  | "grifos"
  | "mnemonicos"
  | "fluxogramas"
  | "flashcards"
  | "questoes"
  | "perguntas";

export type ExportInput = {
  title: string;
  summaryHtml: string;
  notes: NoteRow[];
  mnemonics: Mnemonic[];
  flows: Partial<Record<FlowKind, Flow>>;
  flashcards: { front: string; back: string }[];
  mcq: { question: string; options: string[]; correct_index: number; explanation: string }[];
  review: string[];
};

const esc = (t: string) =>
  String(t ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const multiline = (t: string) =>
  esc(t)
    .replace(/\n{2,}/g, "<br><br>")
    .replace(/\n/g, "<br>");
const LETTERS = "abcdefghij";

function parseBody(html: string) {
  return new DOMParser().parseFromString(`<!doctype html><body>${html}</body>`, "text/html").body;
}

/** Resumo com as notas logo abaixo do bloco anotado (e os grifos, se pedidos). */
function summaryWithNotes(input: ExportInput, withNotes: boolean, withMarks: boolean) {
  const body = parseBody(input.summaryHtml);
  // Só o conteúdo: tira atributos e scripts que não fazem sentido no documento
  body.querySelectorAll("script, style").forEach((n) => n.remove());
  if (!withMarks) body.querySelectorAll("mark").forEach((m) => m.replaceWith(...m.childNodes));
  const blocks = Array.from(body.children);
  if (withNotes) {
    const { byBlock, orphans } = resolveNotes(
      input.notes,
      blocks.map((b) => b.textContent ?? ""),
    );
    for (let i = blocks.length - 1; i >= 0; i--) {
      for (const n of [...(byBlock.get(i) ?? [])].reverse()) {
        const aside = body.ownerDocument.createElement("aside");
        aside.className = "nota";
        aside.innerHTML = `<p><strong>Nota:</strong> ${multiline(n.content)}</p>`;
        blocks[i]!.after(aside);
      }
    }
    if (orphans.length) {
      body.insertAdjacentHTML(
        "beforeend",
        `<h3>Outras notas</h3>${orphans
          .map(
            (n) =>
              `<aside class="nota"><p><strong>Nota:</strong> ${multiline(n.content)}</p></aside>`,
          )
          .join("")}`,
      );
    }
  }
  return body.innerHTML;
}

function mnemonicsHtml(list: Mnemonic[]) {
  return list
    .map((m) => {
      const word =
        m.tipo === "frase" && m.chaves?.length
          ? phraseParts(m.mnemonico, m.chaves)
              .map((p) => (p.key ? `<u>${esc(p.text)}</u>` : esc(p.text)))
              .join("")
          : esc(m.mnemonico);
      return `<h3>${esc(m.lista)}${m.classico ? " (clássico)" : ""}</h3>
<p><strong>${word}</strong></p>
<ol>${m.itens.map((it) => `<li>${esc(it)}</li>`).join("")}</ol>
${m.explicacao ? `<p><em>${esc(m.explicacao)}</em></p>` : ""}`;
    })
    .join("");
}

function flowsHtml(flows: ExportInput["flows"]) {
  return FLOW_KINDS.filter((k) => flows[k.value])
    .map(({ value, label }) => {
      const flow = flows[value]!;
      const order = layoutFlow(flow, roughMeasure).order;
      const number = new Map(order.map((id, i) => [id, i + 1]));
      const byId = new Map(flow.nodes.map((n) => [n.id, n]));
      const items = order
        .map((id) => {
          const n = byId.get(id)!;
          const next = flow.edges
            .filter((e) => e.from === id)
            .map(
              (e) =>
                `${e.label ? `${esc(e.label)}: ` : ""}${esc(byId.get(e.to)?.label ?? "")} (${number.get(e.to)})`,
            );
          return `<li><strong>${esc(n.label)}</strong>${n.kind !== "passo" ? ` <em>(${NODE_KIND_LABEL[n.kind].toLowerCase()})</em>` : ""}${
            n.detail ? `. ${esc(n.detail)}${/[.!?…]$/.test(n.detail) ? "" : "."}` : ""
          }${next.length ? ` Leva a: ${next.join("; ")}.` : ""}</li>`;
        })
        .join("");
      return `<h2>${esc(label)}: ${esc(flow.title)}</h2><ol>${items}</ol>`;
    })
    .join("");
}

/** Monta o documento com as partes pedidas, na ordem de estudo. */
export function buildExportHtml(input: ExportInput, parts: Set<ExportPart>) {
  const date = new Date().toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const out: string[] = [
    `<h1 class="titulo">${esc(input.title)}</h1>`,
    `<p class="meta">FonoLab · exportado em ${esc(date)}</p>`,
  ];
  if (parts.has("resumo") && input.summaryHtml.trim()) {
    out.push(`<h1>Resumo</h1>`, summaryWithNotes(input, parts.has("notas"), parts.has("grifos")));
  }
  if (parts.has("mnemonicos") && input.mnemonics.length) {
    out.push(`<h1>Mnemônicos</h1>`, mnemonicsHtml(input.mnemonics));
  }
  if (parts.has("fluxogramas") && Object.values(input.flows).some(Boolean)) {
    out.push(`<h1>Fluxogramas</h1>`, flowsHtml(input.flows));
  }
  if (parts.has("flashcards") && input.flashcards.length) {
    out.push(
      `<h1>Flashcards</h1>`,
      `<table><thead><tr><th>Frente</th><th>Verso</th></tr></thead><tbody>${input.flashcards
        .map((f) => `<tr><td>${multiline(f.front)}</td><td>${multiline(f.back)}</td></tr>`)
        .join("")}</tbody></table>`,
    );
  }
  if (parts.has("questoes") && input.mcq.length) {
    out.push(`<h1>Questões</h1>`);
    input.mcq.forEach((q, i) => {
      out.push(
        `<p><strong>${i + 1}.</strong> ${multiline(q.question)}</p>`,
        `<ul class="alternativas">${q.options
          .map((o, j) => `<li>${LETTERS[j]}) ${esc(o)}</li>`)
          .join("")}</ul>`,
      );
    });
    out.push(
      `<h2>Gabarito</h2>`,
      ...input.mcq.map(
        (q, i) =>
          `<p><strong>${i + 1}. ${(LETTERS[q.correct_index] ?? "?").toUpperCase()}.</strong> ${multiline(q.explanation)}</p>`,
      ),
    );
  }
  if (parts.has("perguntas") && input.review.length) {
    out.push(
      `<h1>Perguntas para refletir</h1>`,
      `<ol>${input.review.map((r) => `<li>${esc(r)}</li>`).join("")}</ol>`,
    );
  }
  return out.join("\n");
}

/* --------------------------------- Word (.docx) --------------------------------- */

const xml = (t: string) =>
  t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type Fmt = { b?: boolean; i?: boolean; u?: boolean; mark?: boolean; color?: string };

class DocxWriter {
  private lists: string[] = [];
  /** w:num de cada lista numerada (cada uma recomeça do 1). */
  numbering() {
    return this.lists.join("");
  }
  newNumberedList() {
    const id = this.lists.length + 2; // 1 = marcadores
    this.lists.push(
      `<w:num w:numId="${id}"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>`,
    );
    return id;
  }

  runs(node: Node, fmt: Fmt = {}): string {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent ?? "").replace(/\s+/g, " ");
      if (!text) return "";
      const rPr = [
        fmt.b ? "<w:b/>" : "",
        fmt.i ? "<w:i/>" : "",
        fmt.color ? `<w:color w:val="${fmt.color}"/>` : "",
        fmt.mark ? '<w:highlight w:val="yellow"/>' : "",
        fmt.u ? '<w:u w:val="single"/>' : "",
      ].join("");
      return `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ""}<w:t xml:space="preserve">${xml(text)}</w:t></w:r>`;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (tag === "br") return "<w:r><w:br/></w:r>";
    if (["ul", "ol", "table", "p", "h1", "h2", "h3", "aside"].includes(tag)) return "";
    const next: Fmt = {
      ...fmt,
      b: fmt.b || tag === "strong" || tag === "b" || tag === "th",
      i: fmt.i || tag === "em" || tag === "i",
      u: fmt.u || tag === "u",
      mark: fmt.mark || tag === "mark",
    };
    return Array.from(el.childNodes)
      .map((c) => this.runs(c, next))
      .join("");
  }

  /** Os trechos de texto de dentro de um bloco (parágrafo, título, célula). */
  inline(el: Element, fmt: Fmt = {}) {
    return Array.from(el.childNodes)
      .map((c) => this.runs(c, fmt))
      .join("");
  }

  para(content: string, pPr = "") {
    return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ""}${content}</w:p>`;
  }

  blocks(node: Element, ctx: { list?: { num: number; level: number }; fmt?: Fmt } = {}): string {
    let out = "";
    let inline = "";
    const flush = (pPr = "") => {
      if (inline.trim()) out += this.para(inline, pPr);
      inline = "";
    };
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType !== Node.ELEMENT_NODE) {
        // Espaços e quebras entre blocos não viram parágrafos vazios
        if ((child.textContent ?? "").trim()) inline += this.runs(child, ctx.fmt);
        continue;
      }
      const el = child as Element;
      const tag = el.tagName.toLowerCase();
      switch (tag) {
        case "h1":
        case "h2":
        case "h3": {
          flush();
          const style = el.classList.contains("titulo")
            ? "Title"
            : tag === "h1"
              ? "Heading1"
              : tag === "h2"
                ? "Heading2"
                : "Heading3";
          out += this.para(this.inline(el), `<w:pStyle w:val="${style}"/>`);
          break;
        }
        case "p":
        case "div": {
          flush();
          if (tag === "div" && el.querySelector("p, ul, ol, table, h2, h3")) {
            out += this.blocks(el, ctx);
          } else {
            const meta = el.classList.contains("meta");
            out += this.para(
              this.inline(el, meta ? { ...ctx.fmt, color: "6B665E" } : ctx.fmt),
              meta ? '<w:spacing w:after="320"/>' : "",
            );
          }
          break;
        }
        case "aside": {
          flush();
          const pPr =
            '<w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="2346A8"/></w:pBdr><w:shd w:val="clear" w:color="auto" w:fill="EEF1FA"/><w:spacing w:before="60" w:after="160"/><w:ind w:left="240"/>';
          for (const p of Array.from(el.children.length ? el.children : [el])) {
            out += this.para(this.inline(p, { color: "2346A8" }), pPr);
          }
          break;
        }
        case "ul":
        case "ol": {
          flush();
          const level = ctx.list ? Math.min(ctx.list.level + 1, 2) : 0;
          const num = tag === "ol" ? this.newNumberedList() : 1;
          for (const li of Array.from(el.children)) {
            if (li.tagName.toLowerCase() !== "li") continue;
            const pPr = el.classList.contains("alternativas")
              ? '<w:spacing w:after="40"/><w:ind w:left="360"/>'
              : `<w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="${level}"/><w:numId w:val="${num}"/></w:numPr><w:spacing w:after="60"/>`;
            // Conteúdo direto do item numa linha; listas dentro do item, logo abaixo
            let own = "";
            const nested: Element[] = [];
            for (const c of Array.from(li.childNodes)) {
              const t =
                c.nodeType === Node.ELEMENT_NODE ? (c as Element).tagName.toLowerCase() : "";
              if (t === "ul" || t === "ol") nested.push(c as Element);
              else if (t === "p")
                own += (own ? "<w:r><w:br/></w:r>" : "") + this.inline(c as Element);
              else own += this.runs(c);
            }
            out += this.para(own, pPr);
            for (const n of nested) {
              const wrapper = n.ownerDocument.createElement("div");
              wrapper.appendChild(n.cloneNode(true));
              out += this.blocks(wrapper, { list: { num, level } });
            }
          }
          break;
        }
        case "table":
          flush();
          out += this.table(el);
          break;
        default:
          inline += this.runs(el, ctx.fmt);
      }
    }
    flush();
    return out;
  }

  table(el: Element) {
    const rows = Array.from(el.querySelectorAll("tr"));
    const cols = Math.max(1, ...rows.map((r) => r.children.length));
    const width = Math.floor(9638 / cols);
    const border = (side: string) =>
      `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="BFB8AC"/>`;
    const tblPr = `<w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map(border).join("")}</w:tblBorders><w:tblLayout w:type="autofit"/><w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr>`;
    const grid = `<w:tblGrid>${`<w:gridCol w:w="${width}"/>`.repeat(cols)}</w:tblGrid>`;
    const body = rows
      .map((tr) => {
        const header =
          tr.parentElement?.tagName.toLowerCase() === "thead" || tr.querySelector("th") !== null;
        const cells = Array.from(tr.children).map((td) => {
          const isTh = header || td.tagName.toLowerCase() === "th";
          const tcPr = `<w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${isTh ? '<w:shd w:val="clear" w:color="auto" w:fill="EFEBE3"/>' : ""}</w:tcPr>`;
          let inner = td.querySelector("p, ul, ol")
            ? this.blocks(td, isTh ? { fmt: { b: true } } : {})
            : "";
          if (!inner)
            inner = this.para(this.inline(td, isTh ? { b: true } : {}), '<w:spacing w:after="0"/>');
          return `<w:tc>${tcPr}${inner}</w:tc>`;
        });
        while (cells.length < cols)
          cells.push(`<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/></w:tcPr><w:p/></w:tc>`);
        return `<w:tr>${header ? "<w:trPr><w:tblHeader/></w:trPr>" : ""}${cells.join("")}</w:tr>`;
      })
      .join("");
    // Um parágrafo vazio depois da tabela evita que duas tabelas seguidas se fundam no Word
    return `<w:tbl>${tblPr}${grid}${body}</w:tbl><w:p><w:pPr><w:spacing w:after="120"/></w:pPr></w:p>`;
  }
}

const W_NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${W_NS}>
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:color w:val="1F1D1A"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="pt-BR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="140" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="60"/></w:pPr><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/><w:sz w:val="52"/><w:szCs w:val="52"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:pBdr><w:bottom w:val="single" w:sz="8" w:space="4" w:color="1F1D1A"/></w:pBdr><w:spacing w:before="560" w:after="240"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/><w:sz w:val="40"/><w:szCs w:val="40"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="320" w:after="120"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:ind w:left="720"/></w:pPr></w:style>
</w:styles>`;

const NUMBERING = (extra: string) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering ${W_NS}>
<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>${[0, 1, 2]
  .map(
    (l) =>
      `<w:lvl w:ilvl="${l}"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="${["•", "◦", "▪"][l]}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${360 + l * 360}" w:hanging="260"/></w:pPr></w:lvl>`,
  )
  .join("")}</w:abstractNum>
<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${[0, 1, 2]
  .map(
    (l) =>
      `<w:lvl w:ilvl="${l}"><w:start w:val="1"/><w:numFmt w:val="${["decimal", "lowerLetter", "lowerRoman"][l]}"/><w:lvlText w:val="%${l + 1}."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${400 + l * 360}" w:hanging="320"/></w:pPr></w:lvl>`,
  )
  .join("")}</w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>${extra}
</w:numbering>`;

/** Converte o HTML do documento num arquivo .docx. */
export async function htmlToDocx(html: string, title: string): Promise<Blob> {
  const JSZip = (await import("jszip")).default;
  const w = new DocxWriter();
  const body = w.blocks(parseBody(html));
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W_NS}><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;

  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`,
  );
  zip.file(
    "docProps/core.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(title)}</dc:title><dc:creator>FonoLab</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().slice(0, 19)}Z</dcterms:created></cp:coreProperties>`,
  );
  zip.file(
    "word/_rels/document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>`,
  );
  zip.file("word/document.xml", document);
  zip.file("word/styles.xml", STYLES);
  zip.file("word/numbering.xml", NUMBERING(w.numbering()));
  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

/** Nome de arquivo seguro a partir do título do tópico. */
export function fileNameFor(title: string, ext: string) {
  const base = title
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return `${base || "topico"}.${ext}`;
}
