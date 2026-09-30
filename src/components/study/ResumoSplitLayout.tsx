import type { ReactNode } from "react";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ResumoSplitLayout({
  summary,
  viewer,
  viewerOpen,
  onOpenViewer,
}: {
  summary: ReactNode;
  viewer: ReactNode | null;
  viewerOpen: boolean;
  onOpenViewer: () => void;
}) {
  if (!viewer) return <>{summary}</>;

  if (!viewerOpen) {
    return (
      <div>
        {summary}
        <div className="mt-6 flex justify-center border-t border-border pt-4">
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onOpenViewer}>
            <FileText className="size-4" /> Mostrar material original
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:items-start">
      <div className="min-w-0 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-2">{summary}</div>
      <div className="h-[70vh] min-w-0 lg:sticky lg:top-20 lg:h-[calc(100vh-6rem)]">{viewer}</div>
    </div>
  );
}
