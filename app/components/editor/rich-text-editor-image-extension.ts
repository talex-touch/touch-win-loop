import type { Editor, NodeViewRendererProps } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import { CollabMarkdownImage } from '~~/shared/utils/collab-rich-text-schema'

type ImageNodeViewContext = Pick<NodeViewRendererProps, 'editor' | 'node' | 'getPos'>
type ImageNodePositionResolver = ImageNodeViewContext['getPos']

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeImageWidth(value: unknown): number | null {
  const parsed = Math.round(Number(value))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function resolveNodePosition(getPos: ImageNodePositionResolver): number | null {
  if (typeof getPos !== 'function')
    return null

  const position = getPos()
  if (typeof position !== 'number' || !Number.isFinite(position))
    return null

  return Math.max(0, Math.trunc(position))
}

function selectImageNode(editor: Editor, getPos: ImageNodePositionResolver): void {
  const position = resolveNodePosition(getPos)
  if (position === null)
    return

  const transaction = editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, position))
  editor.view.dispatch(transaction)
  editor.view.focus()
}

function updateImageNodeAttributes(editor: Editor, getPos: ImageNodePositionResolver, attrs: Record<string, unknown>): void {
  const position = resolveNodePosition(getPos)
  if (position === null)
    return

  const node = editor.state.doc.nodeAt(position)
  if (!node)
    return

  editor.view.dispatch(editor.state.tr.setNodeMarkup(position, undefined, {
    ...node.attrs,
    ...attrs,
  }))
}

function createResizeHandle(direction: 'left' | 'right'): HTMLButtonElement {
  const handle = document.createElement('button')
  handle.className = `rich-text-editor__image-resize-handle rich-text-editor__image-resize-handle--${direction}`
  handle.type = 'button'
  handle.setAttribute('aria-label', direction === 'left' ? '向左调整图片宽度' : '向右调整图片宽度')
  return handle
}

function createImageNodeView({ editor, node: initialNode, getPos }: ImageNodeViewContext) {
  let currentNode = initialNode
  let selected = false
  let dragCleanup: (() => void) | null = null

  const dom = document.createElement('figure')
  dom.className = 'rich-text-editor__image-node'

  const frame = document.createElement('div')
  frame.className = 'rich-text-editor__image-frame'

  const image = document.createElement('img')
  image.className = 'rich-text-editor__image-element'
  image.draggable = false

  const placeholder = document.createElement('div')
  placeholder.className = 'rich-text-editor__image-placeholder'

  const placeholderIcon = document.createElement('span')
  placeholderIcon.className = 'rich-text-editor__image-placeholder-icon material-symbols-outlined'
  placeholderIcon.setAttribute('aria-hidden', 'true')
  placeholderIcon.textContent = 'image'

  const placeholderTitle = document.createElement('strong')
  placeholderTitle.className = 'rich-text-editor__image-placeholder-title'

  const placeholderMeta = document.createElement('span')
  placeholderMeta.className = 'rich-text-editor__image-placeholder-meta'

  placeholder.append(placeholderIcon, placeholderTitle, placeholderMeta)

  const leftHandle = createResizeHandle('left')
  const rightHandle = createResizeHandle('right')

  frame.append(image, placeholder, leftHandle, rightHandle)
  dom.append(frame)

  const render = () => {
    const src = normalizeString(currentNode.attrs?.src)
    const uploadStatus = normalizeString(currentNode.attrs?.uploadStatus)
    const alt = normalizeString(currentNode.attrs?.alt)
    const title = normalizeString(currentNode.attrs?.title)
    const width = normalizeImageWidth(currentNode.attrs?.width)
    const placeholderName = title || alt || '未命名图片'

    dom.classList.toggle('rich-text-editor__image-node--selected', selected)
    dom.classList.toggle('rich-text-editor__image-node--uploading', uploadStatus === 'uploading')
    if (width)
      dom.style.width = `${width}px`
    else
      dom.style.removeProperty('width')

    if (src) {
      image.hidden = false
      image.setAttribute('src', src)
      image.setAttribute('alt', alt || title || '图片')
      if (title)
        image.setAttribute('title', title)
      else
        image.removeAttribute('title')
      placeholder.hidden = true
    }
    else {
      image.hidden = true
      image.removeAttribute('src')
      image.removeAttribute('title')
      image.setAttribute('alt', placeholderName)
      placeholder.hidden = false
    }

    placeholderTitle.textContent = uploadStatus === 'uploading' ? '图片上传中' : '图片'
    placeholderMeta.textContent = placeholderName
    leftHandle.hidden = !selected || !src || uploadStatus === 'uploading'
    rightHandle.hidden = !selected || !src || uploadStatus === 'uploading'
  }

  const stopResize = () => {
    dragCleanup?.()
    dragCleanup = null
    document.body.classList.remove('rich-text-editor--image-resizing')
  }

  const startResize = (event: MouseEvent, direction: -1 | 1) => {
    event.preventDefault()
    event.stopPropagation()
    selectImageNode(editor, getPos)

    const startX = event.clientX
    const initialWidth = dom.getBoundingClientRect().width || 240
    const editorSurface = dom.closest('.tiptap') as HTMLElement | null
    const maxWidth = Math.max(160, Math.round(editorSurface?.clientWidth || initialWidth))
    let nextWidth = Math.max(120, Math.min(Math.round(initialWidth), maxWidth))

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = (moveEvent.clientX - startX) * direction
      nextWidth = Math.max(120, Math.min(Math.round(initialWidth + delta), maxWidth))
      dom.style.width = `${nextWidth}px`
    }

    const handleMouseUp = () => {
      updateImageNodeAttributes(editor, getPos, { width: nextWidth })
      stopResize()
    }

    document.body.classList.add('rich-text-editor--image-resizing')
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp, { once: true })
    dragCleanup = () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }

  leftHandle.addEventListener('mousedown', event => startResize(event, -1))
  rightHandle.addEventListener('mousedown', event => startResize(event, 1))

  dom.addEventListener('mousedown', (event) => {
    if (!(event.target instanceof HTMLElement))
      return

    if (event.target.closest('.rich-text-editor__image-resize-handle'))
      return

    event.preventDefault()
    selectImageNode(editor, getPos)
  })

  render()

  return {
    dom,
    update(updatedNode: any) {
      if (updatedNode.type.name !== currentNode.type.name)
        return false

      currentNode = updatedNode
      render()
      return true
    },
    selectNode() {
      selected = true
      render()
    },
    deselectNode() {
      selected = false
      render()
    },
    stopEvent(event: Event) {
      return event.target instanceof HTMLElement && Boolean(event.target.closest('.rich-text-editor__image-node'))
    },
    ignoreMutation() {
      return true
    },
    destroy() {
      stopResize()
      leftHandle.remove()
      rightHandle.remove()
    },
  }
}

export function createRichTextEditorImageExtension() {
  return CollabMarkdownImage.extend({
    addNodeView() {
      return (props: ImageNodeViewContext) => createImageNodeView(props)
    },
  })
}
