import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded font-semibold text-sm transition-colors disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-fg hover:bg-[#0d4271]",
        secondary: "border border-secondary text-secondary hover:bg-surface-tonal",
        danger: "bg-danger text-danger-fg hover:bg-[#a81f1f]",
        success: "bg-status-kabul text-white hover:bg-[#256628]",
      },
      size: { md: "px-4 py-2", sm: "px-3 py-1" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
