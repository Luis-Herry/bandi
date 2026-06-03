"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { EpisodeSourceDialog } from "@/components/features/EpisodeSourceDialog";
import { PlayButton } from "@/components/features/PlayButton";
import { cn } from "@/lib/cn";

interface MissedUpdateActionsProps {
  animeId: number;
  animeTitle: string;
  episodeNumber: number;
  isDownloaded: boolean;
}

export function MissedUpdateActions({
  animeId,
  animeTitle,
  episodeNumber,
  isDownloaded,
}: MissedUpdateActionsProps) {
  const [sourceOpen, setSourceOpen] = useState(false);
  const episodeLabel = String(episodeNumber).padStart(2, "0");

  return (
    <div className="flex items-center gap-2">
      {isDownloaded ? (
        <PlayButton
          animeId={animeId}
          episode={episodeNumber}
          label={`播放 EP.${episodeLabel}`}
          variant="primary"
          size="sm"
        />
      ) : (
        <>
          <button
            type="button"
            onClick={() => setSourceOpen(true)}
            aria-label={`搜索 EP.${episodeLabel} 下载源`}
            className={cn(
              "inline-flex h-8 items-center justify-center gap-2 rounded-[6px] px-3",
              "border border-[color:var(--accent-muted)] bg-[color:var(--accent-subtle)]",
              "text-xs font-medium text-[color:var(--accent)]",
              "transition-colors hover:bg-[color:var(--accent-muted)]",
              "focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]",
            )}
          >
            <Search size={12} strokeWidth={2.5} />
            找资源
          </button>
          <EpisodeSourceDialog
            open={sourceOpen}
            onOpenChange={setSourceOpen}
            animeId={animeId}
            animeTitle={animeTitle}
            episodeNumber={episodeNumber}
          />
        </>
      )}
    </div>
  );
}
