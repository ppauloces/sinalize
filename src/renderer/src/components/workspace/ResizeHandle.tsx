import { Separator } from 'react-resizable-panels'

// Divisor de 1 px entre docks; destaca no hover e durante o arrasto.
export function ResizeHandle() {
  return (
    <Separator className="relative shrink-0 bg-line transition-colors outline-none aria-[orientation=horizontal]:h-px aria-[orientation=vertical]:w-px data-[separator=active]:bg-brand data-[separator=focus]:bg-brand data-[separator=hover]:bg-brand/70" />
  )
}
