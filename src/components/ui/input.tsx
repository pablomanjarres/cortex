import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"
import { inlineControlStyles, textControlStyles } from "./control-styles"

type InputProps = React.ComponentProps<"input"> & { variant?: 'default' | 'inline' }

function Input({ className, type, variant = 'default', ...props }: InputProps) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        textControlStyles,
        "h-10 disabled:pointer-events-none",
        "file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        variant === 'inline' && inlineControlStyles,
        className
      )}
      {...props}
    />
  )
}

export { Input }
