import { Switch as SwitchPrimitive } from '@base-ui/react/switch'
import { cn } from '@/lib/utils'

/** On/off switch with the shared accent, focus, and disabled states. Space and Enter toggle it. */
export function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-border bg-secondary p-0.5 motion-safe:transition-colors motion-safe:duration-150 outline-none',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        'data-[checked]:border-accent data-[checked]:bg-accent',
        'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="block size-4.5 rounded-full bg-card shadow-sm motion-safe:transition-transform motion-safe:duration-150 data-[checked]:translate-x-5"
      />
    </SwitchPrimitive.Root>
  )
}
