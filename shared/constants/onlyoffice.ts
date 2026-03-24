export const ONLYOFFICE_ERROR_CODE_DESCRIPTION: Record<number, string> = {
  [-1]: '未知错误',
  [-2]: '转换超时',
  [-3]: '转换过程发生内部错误',
  [-4]: 'ONLYOFFICE 无法下载待转换源文件（常见于地址不可达、网络隔离或证书问题）',
  [-5]: '文档密码错误',
  [-6]: '访问转换结果存储失败',
  [-7]: '输入参数错误',
  [-8]: 'JWT 校验失败（无效 token）',
  [-9]: '转换并发或配额超限',
  [-10]: '异步回调处理失败',
}

const ONLYOFFICE_CONVERT_ERROR_PATTERN = /^ONLYOFFICE_CONVERT_ERROR_(-?\d+):(.*)$/s

export function getOnlyOfficeErrorCodeDescription(code: number): string {
  return ONLYOFFICE_ERROR_CODE_DESCRIPTION[code] || `未知错误码 ${code}`
}

export function parseOnlyOfficeConvertErrorMessage(rawMessage: string): {
  code: number | null
  detail: string
  raw: string
} {
  const raw = String(rawMessage || '').trim()
  const matched = raw.match(ONLYOFFICE_CONVERT_ERROR_PATTERN)
  if (!matched) {
    return {
      code: null,
      detail: '',
      raw,
    }
  }

  const parsedCode = Number(matched[1])
  return {
    code: Number.isFinite(parsedCode) ? parsedCode : null,
    detail: String(matched[2] || '').trim(),
    raw,
  }
}

export function buildOnlyOfficeUserFacingErrorMessage(rawMessage: string): string {
  const parsed = parseOnlyOfficeConvertErrorMessage(rawMessage)
  if (parsed.code === null) {
    return parsed.raw || '文件转换失败，请稍后重试。'
  }

  const normalizedDetail = parsed.detail.trim()
  const description = getOnlyOfficeErrorCodeDescription(parsed.code)
  const hasExtraDetail = normalizedDetail.length > 0
    && normalizedDetail.toLowerCase() !== 'unknown'
    && normalizedDetail !== description

  if (!hasExtraDetail) {
    return `文件转换失败（ONLYOFFICE 错误码 ${parsed.code}）：${description}`
  }

  return `文件转换失败（ONLYOFFICE 错误码 ${parsed.code}）：${description}；详情：${normalizedDetail}`
}
