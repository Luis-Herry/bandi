"use client";

import { Search } from "lucide-react";
import { Button } from "@/components/ui";

export function SearchOpenButton() {
  return (
    <Button
      variant="secondary"
      size="lg"
      leftIcon={<Search size={14} />}
      onClick={() => {
        window.dispatchEvent(new Event("bandi:open-search"));
      }}
    >
      搜索番剧
    </Button>
  );
}
