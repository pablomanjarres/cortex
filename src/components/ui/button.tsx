import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Button — the ONLY sanctioned button primitive (hand-rolled buttons are banned).
 * default   = white-on-black primary action (part of the Cortex identity)
 * secondary = quiet surface-toned action
 * ghost     = bare, for icon buttons and tertiary actions
 * destructive = soft danger tint (never solid red)
 * accent-outline = the ONE accent, outlined — for rare "selected/engage" actions
 * Radius rule: controls are rounded-md. Focus: 2px accent outline. Press: scale 0.98.
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-md border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-[background-color,border-color,color,transform,opacity] duration-150 select-none outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive/50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary:
          "border-border bg-secondary/70 text-foreground hover:bg-secondary aria-expanded:bg-secondary",
        outline:
          "border-border bg-transparent text-foreground hover:bg-muted/60 aria-expanded:bg-muted/60",
        ghost:
          "text-muted-foreground hover:bg-muted/60 hover:text-foreground aria-expanded:bg-muted/60 aria-expanded:text-foreground",
        destructive:
          "border-destructive/25 bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:outline-destructive",
        "accent-outline":
          "border-accent/40 bg-transparent text-accent hover:border-accent/60 hover:bg-accent/10 aria-expanded:bg-accent/10",
        link: "text-accent underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-3 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 px-2.5 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        icon: "size-8",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
