import { useEffect, useRef, useState } from "react";
import { Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// Tipos mínimos para não depender dos tipos do pdfjs no carregamento do módulo.
type PdfPage = {
  getViewport: (o: { scale: number }) => { width: number; height: number };
  render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown; canvas?: HTMLCanvasElement }) => { promise: Promise<void> };
};
type PdfDoc = { numPages: number; getPage: (n: number) => Promise<PdfPage>; destroy: () => void };

export function SourcePdfViewer({ url, loading, onClose }: { url: string | null; loading?: boolean; onClose: () => void }) {
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [error, setError] = useState(false);
  const [current, setCurrent] = useState(1);
  const [width, setWidth] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    // No pdf.js 6, quem fecha o documento é a tarefa de carregamento (o documento não tem mais destroy()).
    let task: { destroy: () => Promise<void> } | null = null;
    setDoc(null);
    setError(false);
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        const loadingTask = pdfjs.getDocument({ url });
        task = loadingTask;
        const loaded = (await loadingTask.promise) as unknown as PdfDoc;
        if (cancelled) void loadingTask.destroy();
        else setDoc(loaded);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
      void task?.destroy().catch(() => undefined);
    };
  }, [url]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth - 24));
    ro.observe(el);
    return () => ro.disconnect();
  }, [doc]);

  if (!url && !loading) return null;

  return (
    <div className="card-soft flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">Material original</p>
          {doc && <p className="text-xs text-muted-foreground">Página {current} de {doc.numPages}</p>}
        </div>
        <Button size="icon" variant="ghost" onClick={onClose} title="Minimizar">
          <Minimize2 className="size-4" />
        </Button>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto bg-muted p-3">
        {error ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Não foi possível abrir o material</p>
        ) : !doc || loading ? (
          <div className="space-y-3">
            <Skeleton className="h-[60vh] w-full" />
            <Skeleton className="h-[40vh] w-full" />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            {Array.from({ length: doc.numPages }, (_, i) => (
              <PdfPageCanvas key={i} doc={doc} pageNumber={i + 1} width={width} root={scrollRef.current} onVisible={setCurrent} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PdfPageCanvas({
  doc,
  pageNumber,
  width,
  root,
  onVisible,
}: {
  doc: PdfDoc;
  pageNumber: number;
  width: number;
  root: HTMLElement | null;
  onVisible: (n: number) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(false);
  const [height, setHeight] = useState(width * 1.414);

  // Renderização preguiçosa: só desenha quando a página chega perto da área visível.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const lazy = new IntersectionObserver(([e]) => e?.isIntersecting && setNear(true), { root, rootMargin: "600px 0px" });
    const counter = new IntersectionObserver(([e]) => e?.isIntersecting && onVisible(pageNumber), { root, threshold: 0.5 });
    lazy.observe(el);
    counter.observe(el);
    return () => {
      lazy.disconnect();
      counter.disconnect();
    };
  }, [root, pageNumber, onVisible]);

  useEffect(() => {
    if (!near || width <= 0) return;
    let cancelled = false;
    (async () => {
      const page = await doc.getPage(pageNumber);
      if (cancelled || !canvasRef.current) return;
      const base = page.getViewport({ scale: 1 });
      const scale = width / base.width;
      const dpr = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: scale * dpr });
      const canvas = canvasRef.current;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${viewport.height / dpr}px`;
      setHeight(viewport.height / dpr);
      const ctx = canvas.getContext("2d");
      if (ctx) await page.render({ canvasContext: ctx, viewport, canvas }).promise.catch(() => {});
    })();
    return () => {
      cancelled = true;
    };
  }, [near, width, doc, pageNumber]);

  return (
    <div ref={wrapRef} className="bg-card shadow-sm" style={{ width, minHeight: height }}>
      <canvas ref={canvasRef} />
    </div>
  );
}