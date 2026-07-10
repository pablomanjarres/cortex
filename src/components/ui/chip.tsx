import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Chip — the ONE tag/category/filter primitive. Replaces every per-page
 * rainbow chip config.
 *
 * neutral (DEFAULT)          = hairline outline + mono label — categories, tags,
 *                              domains, subjects. NEVER invent per-item hues.
 * accent                     = the ONE signal — selected/active filters only.
 * success | warning | danger = status semantics only (ok / at-risk / failing).
 *
 * `selectable` renders a <button> (aria-pressed = selected); `selected`
 * promotes any variant to the accent look.
 */
const chipVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1 rounded-full border font-mono whitespace-nowrap transition-colors duration-150 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        neutral: "border-border bg-transparent text-muted-foreground",
        accent: "border-accent/40 bg-accent/10 text-accent",
        success: "border-success/25 bg-success/10 text-success",
        warning: "border-warning/25 bg-warning/10 text-warning",
        danger: "border-destructive/25 bg-destructive/10 text-destructive",
      },
      size: {
        sm: "px-1.5 py-px text-3xs",
        md: "px-2 py-0.5 text-2xs",
      },
      selectable: {
        true: "cursor-pointer select-none active:scale-[0.98]",
        false: "",
      },
    },
    compoundVariants: [
      {
        variant: "neutral",
        selectable: true,
        className: "hover:border-input hover:text-foreground",
      },
    ],
    defaultVariants: {
      variant: "neutral",
      size: "md",
      selectable: false,
    },
  }
)

type ChipProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  Omit<VariantProps<typeof chipVariants>, "selectable"> & {
    /** Render as a pressable <button> (filters, toggles) */
    selectable?: boolean
    /** Selected state — promotes styling to the accent look */
    selected?: boolean
  }

function Chip({
  className,
  variant = "neutral",
  size = "md",
  selectable = false,
  selected = false,
  type,
  ...props
}: ChipProps) {
  const classes = cn(
    chipVariants({
      variant: selected ? "accent" : variant,
      size,
      selectable,
    }),
    className
  )

  if (selectable) {
    return (
      <button
        data-slot="chip"
        type={type ?? "button"}
        aria-pressed={selected}
        className={classes}
        {...props}
      />
    )
  }

  return (
    <span
      data-slot="chip"
      className={classes}
      {...(props as React.HTMLAttributes<HTMLSpanElement>)}
    />
  )
}

export { Chip }
