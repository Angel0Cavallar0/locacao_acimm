"use client"

import { PreviewCard as HoverCardPrimitive } from "@base-ui/react/preview-card"

import { cn } from "@/lib/utils"

function HoverCard({ ...props }: HoverCardPrimitive.Root.Props) {
  return <HoverCardPrimitive.Root data-slot="hover-card" {...props} />
}

/**
 * Gatilho do hover. Renderiza `<span>` por padrão (não `<a>`) para poder ser
 * aninhado com segurança dentro dos eventos do FullCalendar, que já são links.
 */
function HoverCardTrigger({
  render = <span />,
  delay = 150,
  closeDelay = 80,
  ...props
}: HoverCardPrimitive.Trigger.Props & {
  delay?: number
  closeDelay?: number
}) {
  return (
    <HoverCardPrimitive.Trigger
      data-slot="hover-card-trigger"
      render={render}
      delay={delay}
      closeDelay={closeDelay}
      {...props}
    />
  )
}

function HoverCardContent({
  className,
  side = "top",
  sideOffset = 6,
  align = "center",
  ...props
}: HoverCardPrimitive.Popup.Props &
  Pick<
    HoverCardPrimitive.Positioner.Props,
    "side" | "sideOffset" | "align"
  >) {
  return (
    <HoverCardPrimitive.Portal>
      <HoverCardPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        className="isolate z-50"
      >
        <HoverCardPrimitive.Popup
          data-slot="hover-card-content"
          className={cn(
            "w-64 origin-(--transform-origin) rounded-lg bg-popover p-3 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className
          )}
          {...props}
        />
      </HoverCardPrimitive.Positioner>
    </HoverCardPrimitive.Portal>
  )
}

export { HoverCard, HoverCardContent, HoverCardTrigger }
