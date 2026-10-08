import type { ReceiptForm, ReceiptInput, StockInteger } from '@/types/stock'
import type { NormalizedApiError } from '@/utils/request'
export const MAX_STOCK_INTEGER = 9223372036854775807n
// Scan number tokens before JSON.parse rounds them; preserve string tokens intact.
export const parseStockJson = (source: string): unknown => {
  const integers: bigint[] = []
  const marker = `__stock_integer_${Math.random().toString(36).slice(2)}__`
  const transformed = source.replace(
    /"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g,
    (token) => {
      if (token.startsWith('"') || /[.eE]/.test(token)) return token
      const value = BigInt(token)
      if (value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= BigInt(Number.MIN_SAFE_INTEGER))
        return token
      const index = integers.push(value) - 1
      return JSON.stringify({ [marker]: index })
    },
  )
  return JSON.parse(transformed, (_key: string, value: unknown) => {
    if (value && typeof value === 'object' && marker in value) {
      const index = (value as Record<string, unknown>)[marker]
      if (typeof index === 'number') return integers[index]
    }
    return value
  }) as unknown
}
export const stringifyStockJson = (value: unknown): string => {
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'number' && !Number.isSafeInteger(value))
    throw new Error('Unsafe integer payload')
  if (Array.isArray(value)) return `[${value.map(stringifyStockJson).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => `${JSON.stringify(key)}:${stringifyStockJson(item)}`)
      .join(',')}}`
  const result = JSON.stringify(value)
  if (result === undefined) throw new Error('Unsupported JSON value')
  return result
}
export const validStockInteger = (value: string, positive = false): boolean => {
  if (!/^\d{1,19}$/.test(value.trim())) return false
  const integer = BigInt(value.trim())
  return integer <= MAX_STOCK_INTEGER && integer >= (positive ? 1n : 0n)
}
export const formatStockInteger = (value: StockInteger): string =>
  BigInt(value).toLocaleString('vi-VN')
export const receiptInput = (form: ReceiptForm): ReceiptInput => ({
  receiptDate: form.receiptDate,
  supplierName: form.supplierName.trim() || undefined,
  note: form.note.trim() || undefined,
  lines: form.lines.map((line) => ({
    productId: line.productId,
    quantity: BigInt(line.quantity.trim()),
    unitPrice: BigInt(line.unitPrice.trim()),
  })),
})
export const validateReceipt = (
  form: ReceiptForm,
  t: (key: string) => string,
): Record<string, string> => {
  const errors: Record<string, string> = {}
  if (!form.warehouseId) errors.warehouseId = t('stock.required')
  const date = new Date(`${form.receiptDate}T00:00:00Z`)
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(form.receiptDate) ||
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== form.receiptDate
  )
    errors.receiptDate = t('stock.invalidDate')
  if (!form.lines.length) errors.lines = t('stock.atLeastOneLine')
  const ids = new Set<string>()
  form.lines.forEach((line, index) => {
    if (!line.productId) errors[`lines[${index}].productId`] = t('stock.required')
    else if (ids.has(line.productId))
      errors[`lines[${index}].productId`] = t('stock.duplicateProduct')
    ids.add(line.productId)
    if (!validStockInteger(line.quantity, true))
      errors[`lines[${index}].quantity`] = t('stock.invalidQuantity')
    if (!validStockInteger(line.unitPrice))
      errors[`lines[${index}].unitPrice`] = t('stock.invalidPrice')
  })
  return errors
}
export const stockError = (cause: unknown, t: (key: string) => string): string => {
  const error = cause as NormalizedApiError | undefined
  if (error?.status === 409 && error.code === 'INSUFFICIENT_STOCK')
    return t('stock.insufficientStock')
  if (error?.status === 409) return `${t('stock.conflict')} ${error.message}`
  if (error?.status === 403) return t('stock.forbidden')
  if (error?.status === 404) return t('stock.notFound')
  return cause instanceof Error ? cause.message : t('errors.unknown')
}
export const stockFieldErrors = (cause: unknown): Record<string, string> => {
  const error = cause as NormalizedApiError | undefined
  if (error?.code !== 'VALIDATION_ERROR' || !error.details || typeof error.details !== 'object')
    return {}
  return Object.fromEntries(
    Object.entries(error.details).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  )
}
export const movementRange = (from?: string, to?: string): { from?: string; to?: string } => ({
  ...(from ? { from: new Date(from).toISOString() } : {}),
  ...(to ? { to: new Date(to).toISOString() } : {}),
})
