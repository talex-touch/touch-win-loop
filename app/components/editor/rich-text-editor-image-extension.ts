import type { Editor, NodeViewRendererProps } from '@tiptap/core'
import type { ProjectResourceCommentImageNodeAnchor } from '~~/shared/types/domain'
import { NodeSelection } from '@tiptap/pm/state'
import { CollabMarkdownImage } from '~~/shared/utils/collab-rich-text-schema'

type ImageNodeViewContext = Pick<NodeViewRendererProps, 'editor' | 'node' | 'getPos'>
type ImageNodePositionResolver = ImageNodeViewContext['getPos']

export interface RichTextEditorImageNodeActionPayload {
  resourceId?: string | null
  src: string
  mode: 'open_resource' | 'delete_node' | 'delete_and_recycle'
}

export interface RichTextEditorImageNodeCommentThread {
  id: string
}

export interface RichTextEditorImageExtensionOptions {
  getImageCommentThreads?: (attrs: Record<string, unknown>) => RichTextEditorImageNodeCommentThread[]
  getActiveCommentThreadId?: () => string
  onOpenCommentThread?: (threadId: string) => void
  onCreateCommentFromImage?: (anchor: ProjectResourceCommentImageNodeAnchor) => void
  onRequestImageAction?: (payload: RichTextEditorImageNodeActionPayload) => void
}

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

function deleteImageNode(editor: Editor, getPos: ImageNodePositionResolver): boolean {
  const position = resolveNodePosition(getPos)
  if (position === null)
    return false

  const node = editor.state.doc.nodeAt(position)
  if (!node)
    return false

  editor.view.dispatch(editor.state.tr.deleteRange(position, position + node.nodeSize))
  editor.view.focus()
  return true
}

function createResizeHandle(direction: 'left' | 'right'): HTMLButtonElement {
  const handle = document.createElement('button')
  handle.className = `rich-text-editor__image-resize-handle rich-text-editor__image-resize-handle--${direction}`
  handle.type = 'button'
  handle.setAttribute('aria-label', direction === 'left' ? '向左调整图片宽度' : '向右调整图片宽度')
  return handle
}

function createIconButton(label: string, icon: string, className: string): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = className
  button.setAttribute('aria-label', label)
  button.title = label

  const iconElement = document.createElement('span')
  iconElement.className = 'material-symbols-outlined'
  iconElement.setAttribute('aria-hidden', 'true')
  iconElement.textContent = icon
  button.append(iconElement)
  return button
}

function buildImageCommentAnchor(attrs: Record<string, unknown>): ProjectResourceCommentImageNodeAnchor | null {
  const src = normalizeString(attrs.src)
  if (!src)
    return null

  return {
    type: 'image_node',
    resourceId: normalizeString(attrs.resourceId) || null,
    src,
    alt: normalizeString(attrs.alt) || null,
    title: normalizeString(attrs.title) || null,
  }
}

function createImageNodeView(options: RichTextEditorImageExtensionOptions, { editor, node: initialNode, getPos }: ImageNodeViewContext) {
  let currentNode = initialNode
  let selected = false
  let dragCleanup: (() => void) | null = null
  let metadataEditorVisible = false
  let loadError = false
  let imageReloadToken = 0

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

  const placeholderActions = document.createElement('div')
  placeholderActions.className = 'rich-text-editor__image-placeholder-actions'

  const retryButton = document.createElement('button')
  retryButton.type = 'button'
  retryButton.className = 'rich-text-editor__image-placeholder-action'
  retryButton.textContent = '重试加载'

  const openResourceButton = document.createElement('button')
  openResourceButton.type = 'button'
  openResourceButton.className = 'rich-text-editor__image-placeholder-action'
  openResourceButton.textContent = '打开原图'

  placeholderActions.append(retryButton, openResourceButton)
  placeholder.append(placeholderIcon, placeholderTitle, placeholderMeta, placeholderActions)

  const actionBar = document.createElement('div')
  actionBar.className = 'rich-text-editor__image-action-bar'

  const commentBadge = document.createElement('button')
  commentBadge.type = 'button'
  commentBadge.className = 'rich-text-editor__image-comment-badge'

  const editMetaButton = createIconButton('编辑图片说明', 'edit', 'rich-text-editor__image-action-button')
  const resetWidthButton = createIconButton('恢复原始宽度', 'width_normal', 'rich-text-editor__image-action-button')
  const openButton = createIconButton('打开资源', 'open_in_new', 'rich-text-editor__image-action-button')
  const commentButton = createIconButton('添加评论', 'add_comment', 'rich-text-editor__image-action-button')
  const deleteButton = createIconButton('删除图片', 'delete', 'rich-text-editor__image-action-button')
  const recycleButton = createIconButton('删除并回收资源', 'delete_forever', 'rich-text-editor__image-action-button rich-text-editor__image-action-button--danger')

  actionBar.append(editMetaButton, resetWidthButton, openButton, commentButton, deleteButton, recycleButton)

  const metadataEditor = document.createElement('div')
  metadataEditor.className = 'rich-text-editor__image-meta-editor'

  const altInput = document.createElement('input')
  altInput.className = 'rich-text-editor__image-meta-input'
  altInput.placeholder = 'Alt 文本'

  const titleInput = document.createElement('input')
  titleInput.className = 'rich-text-editor__image-meta-input'
  titleInput.placeholder = '标题'

  const metadataActions = document.createElement('div')
  metadataActions.className = 'rich-text-editor__image-meta-actions'

  const metadataCancel = document.createElement('button')
  metadataCancel.type = 'button'
  metadataCancel.className = 'rich-text-editor__image-meta-button'
  metadataCancel.textContent = '取消'

  const metadataSave = document.createElement('button')
  metadataSave.type = 'button'
  metadataSave.className = 'rich-text-editor__image-meta-button rich-text-editor__image-meta-button--primary'
  metadataSave.textContent = '保存'

  metadataActions.append(metadataCancel, metadataSave)
  metadataEditor.append(altInput, titleInput, metadataActions)

  const leftHandle = createResizeHandle('left')
  const rightHandle = createResizeHandle('right')

  frame.append(image, placeholder, commentBadge, actionBar, metadataEditor, leftHandle, rightHandle)
  dom.append(frame)

  const render = () => {
    const src = normalizeString(currentNode.attrs?.src)
    const uploadStatus = normalizeString(currentNode.attrs?.uploadStatus)
    const alt = normalizeString(currentNode.attrs?.alt)
    const title = normalizeString(currentNode.attrs?.title)
    const resourceId = normalizeString(currentNode.attrs?.resourceId)
    const width = normalizeImageWidth(currentNode.attrs?.width)
    const placeholderName = title || alt || '未命名图片'
    const commentThreads = options.getImageCommentThreads?.(currentNode.attrs || {}) || []
    const activeCommentThreadId = normalizeString(options.getActiveCommentThreadId?.())
    const hasActiveComment = commentThreads.some(thread => thread.id === activeCommentThreadId)

    dom.classList.toggle('rich-text-editor__image-node--selected', selected)
    dom.classList.toggle('rich-text-editor__image-node--uploading', uploadStatus === 'uploading')
    dom.classList.toggle('rich-text-editor__image-node--load-error', loadError)
    dom.classList.toggle('rich-text-editor__image-node--comment-active', hasActiveComment)
    if (width)
      dom.style.width = `${width}px`
    else
      dom.style.removeProperty('width')

    const renderedSrc = src && imageReloadToken
      ? `${src}${src.includes('?') ? '&' : '?'}retry=${imageReloadToken}`
      : src

    if (src && !loadError) {
      image.hidden = false
      if (image.getAttribute('src') !== renderedSrc)
        image.setAttribute('src', renderedSrc)
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

    if (loadError) {
      placeholderTitle.textContent = '图片加载失败'
      placeholderMeta.textContent = placeholderName || '资源地址不可用'
      placeholderActions.hidden = false
      placeholderIcon.textContent = 'broken_image'
    }
    else {
      placeholderTitle.textContent = uploadStatus === 'uploading' ? '图片上传中' : '图片'
      placeholderMeta.textContent = placeholderName
      placeholderActions.hidden = true
      placeholderIcon.textContent = 'image'
    }

    commentBadge.hidden = commentThreads.length === 0
    commentBadge.textContent = commentThreads.length > 99 ? '99+' : String(commentThreads.length || '')
    commentBadge.classList.toggle('rich-text-editor__image-comment-badge--active', hasActiveComment)
    actionBar.hidden = !selected || !src || uploadStatus === 'uploading'
    metadataEditor.hidden = !selected || !metadataEditorVisible || !src || uploadStatus === 'uploading'
    resetWidthButton.hidden = !width
    recycleButton.hidden = !resourceId
    commentButton.hidden = typeof options.onCreateCommentFromImage !== 'function'
    leftHandle.hidden = !selected || !src || uploadStatus === 'uploading'
    rightHandle.hidden = !selected || !src || uploadStatus === 'uploading'
    altInput.value = alt
    titleInput.value = title
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

  const openSourceResource = () => {
    const src = normalizeString(currentNode.attrs?.src)
    if (!src)
      return

    const resourceId = normalizeString(currentNode.attrs?.resourceId)
    if (resourceId) {
      options.onRequestImageAction?.({
        resourceId,
        src,
        mode: 'open_resource',
      })
      return
    }

    window.open(src, '_blank', 'noopener,noreferrer')
  }

  const deleteCurrentNode = (mode: RichTextEditorImageNodeActionPayload['mode']) => {
    const src = normalizeString(currentNode.attrs?.src)
    if (!src)
      return

    const payload: RichTextEditorImageNodeActionPayload = {
      resourceId: normalizeString(currentNode.attrs?.resourceId) || null,
      src,
      mode,
    }
    deleteImageNode(editor, getPos)
    if (mode === 'delete_and_recycle')
      options.onRequestImageAction?.(payload)
  }

  const openMetadataEditor = () => {
    metadataEditorVisible = true
    render()
    requestAnimationFrame(() => {
      altInput.focus()
      altInput.select()
    })
  }

  const closeMetadataEditor = () => {
    metadataEditorVisible = false
    render()
  }

  const saveMetadata = () => {
    updateImageNodeAttributes(editor, getPos, {
      alt: normalizeString(altInput.value) || null,
      title: normalizeString(titleInput.value) || null,
    })
    metadataEditorVisible = false
  }

  leftHandle.addEventListener('mousedown', event => startResize(event, -1))
  rightHandle.addEventListener('mousedown', event => startResize(event, 1))

  commentBadge.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    selectImageNode(editor, getPos)
    const threads = options.getImageCommentThreads?.(currentNode.attrs || {}) || []
    if (threads[0]?.id)
      options.onOpenCommentThread?.(threads[0].id)
  })

  retryButton.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    loadError = false
    imageReloadToken = Date.now()
    render()
  })

  openResourceButton.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    openSourceResource()
  })

  editMetaButton.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    openMetadataEditor()
  })

  resetWidthButton.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    updateImageNodeAttributes(editor, getPos, {
      width: null,
    })
  })

  openButton.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    openSourceResource()
  })

  commentButton.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    const anchor = buildImageCommentAnchor(currentNode.attrs || {})
    if (anchor)
      options.onCreateCommentFromImage?.(anchor)
  })

  deleteButton.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    deleteCurrentNode('delete_node')
  })

  recycleButton.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    deleteCurrentNode('delete_and_recycle')
  })

  metadataCancel.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    closeMetadataEditor()
  })

  metadataSave.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    saveMetadata()
  })

  const handleMetadataKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      closeMetadataEditor()
      return
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      event.stopPropagation()
      saveMetadata()
    }
  }

  altInput.addEventListener('keydown', handleMetadataKeydown)
  titleInput.addEventListener('keydown', handleMetadataKeydown)

  image.addEventListener('load', () => {
    loadError = false
    render()
  })

  image.addEventListener('error', () => {
    if (!normalizeString(currentNode.attrs?.src))
      return
    loadError = true
    render()
  })

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
      if (!normalizeString(currentNode.attrs?.src))
        loadError = false
      render()
      return true
    },
    selectNode() {
      selected = true
      render()
    },
    deselectNode() {
      selected = false
      metadataEditorVisible = false
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

export function createRichTextEditorImageExtension(options: RichTextEditorImageExtensionOptions = {}) {
  return CollabMarkdownImage.extend({
    addNodeView() {
      return (props: ImageNodeViewContext) => createImageNodeView(options, props)
    },
  })
}
