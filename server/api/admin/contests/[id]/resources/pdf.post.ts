import uploadDocumentHandler from './document.post'

export default defineEventHandler(async (event) => {
  return uploadDocumentHandler(event)
})
