import { Button as ButtonPrimitive } from "@base-ui/react/button"
import type { VariantProps } from "class-variance-authority"
import { buttonVariants } from "./button-variants"

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

export { Button }
