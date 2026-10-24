import { useCallback, useRef, useState, type DragEvent } from 'react'

/** Drag payloads a file drop zone reacts to: files, dragged links and text. */
export const acceptsDrag = (types: readonly string[]) =>
  types.some(t => t === 'Files' || t === 'text/uri-list' || t === 'text/plain')

/**
 * Drop-zone state for a panel. An enter/leave depth counter keeps `active`
 * from flickering while the pointer crosses child elements.
 */
export function useFileDropZone(onDrop: (dt: DataTransfer) => void) {
  const depth = useRef(0)
  const [active, setActive] = useState(false)

  const reset = useCallback(() => { depth.current = 0; setActive(false) }, [])

  const bind = {
    onDragEnter: (e: DragEvent) => {
      if (!acceptsDrag(Array.from(e.dataTransfer.types))) return
      e.preventDefault(); depth.current++; setActive(true)
    },
    onDragOver: (e: DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' },
    onDragLeave: () => {
      depth.current = Math.max(0, depth.current - 1)
      if (depth.current === 0) setActive(false)
    },
    onDrop: (e: DragEvent) => { e.preventDefault(); reset(); onDrop(e.dataTransfer) },
  }

  return { active, bind, reset }
}
