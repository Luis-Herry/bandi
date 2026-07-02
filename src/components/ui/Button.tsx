import {
  Children,
  cloneElement,
  forwardRef,
  isValidElement,
  type ButtonHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/cn";

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "font-medium select-none",
    "transition-[background,color,border-color,opacity,transform] duration-150",
    "[transition-timing-function:var(--ease-default)]",
    "disabled:opacity-40 disabled:pointer-events-none",
    "focus-visible:outline-1 focus-visible:outline-offset-2",
    "rounded-[6px]",
  ],
  {
    variants: {
      variant: {
        primary: [
          "bg-[color:var(--accent)] text-[color:var(--accent-contrast)]",
          "hover:brightness-110 active:brightness-95",
        ],
        secondary: [
          "border border-[color:var(--border-default)] bg-[color:var(--bg-surface)]",
          "backdrop-blur-[12px] text-[color:var(--text-primary)]",
          "hover:bg-[color:var(--bg-surface-hover)] hover:border-[color:var(--border-strong)]",
        ],
        ghost: [
          "bg-transparent text-[color:var(--text-secondary)]",
          "hover:bg-[color:var(--bg-surface)] hover:text-[color:var(--text-primary)]",
        ],
        // 不透明实底次要按钮：用于裸贴页面渐变背景的操作按钮（如影视区顶部扫描/刮削），
        // 避免 secondary 的半透明玻璃透出背景渐变形成上下分层。
        solid: [
          "border border-[color:var(--border-default)] bg-[color:var(--bg-elevated)] text-[color:var(--text-primary)]",
          "hover:border-[color:var(--border-strong)] hover:bg-[color:var(--bg-elevated)] hover:brightness-150",
        ],
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-6 text-base",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild, leftIcon, rightIcon, children, ...rest },
  ref,
) {
  // When asChild is used, Slot requires exactly one React element child.
  // If leftIcon/rightIcon are provided, inject them into the child element
  // instead of rendering them as siblings (which would break Children.only).
  if (asChild && (leftIcon || rightIcon)) {
    const onlyChild = Children.only(children);
    if (isValidElement<{ children?: ReactNode }>(onlyChild)) {
      const merged = cloneElement(onlyChild as ReactElement<{ children?: ReactNode }>, {
        children: (
          <>
            {leftIcon}
            {(onlyChild.props as { children?: ReactNode }).children}
            {rightIcon}
          </>
        ),
      });
      return (
        <Slot
          ref={ref}
          className={cn(buttonVariants({ variant, size }), className)}
          {...rest}
        >
          {merged}
        </Slot>
      );
    }
  }

  // Plain asChild path: Slot needs exactly one child element.
  if (asChild) {
    return (
      <Slot
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...rest}
      >
        {children}
      </Slot>
    );
  }

  return (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...rest}
    >
      {leftIcon}
      {children}
      {rightIcon}
    </button>
  );
});
