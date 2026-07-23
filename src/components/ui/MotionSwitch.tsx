"use client";

import { useState, type ComponentPropsWithoutRef } from "react";
import * as Switch from "@radix-ui/react-switch";
import { cn } from "@/lib/cn";

export interface MotionSwitchProps
  extends Omit<
    ComponentPropsWithoutRef<typeof Switch.Root>,
    "children" | "onCheckedChange"
  > {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  thumbClassName?: string;
}

export function MotionSwitch({
  checked,
  onCheckedChange,
  className,
  thumbClassName,
  ...props
}: MotionSwitchProps) {
  const [initialized, setInitialized] = useState(false);

  return (
    <Switch.Root
      {...props}
      checked={checked}
      data-on={checked ? "true" : "false"}
      onCheckedChange={(nextChecked) => {
        setInitialized(true);
        onCheckedChange(nextChecked);
      }}
      className={cn("t-toggle", initialized && "is-init", className)}
    >
      <Switch.Thumb className={cn("t-toggle-thumb", thumbClassName)} />
    </Switch.Root>
  );
}
