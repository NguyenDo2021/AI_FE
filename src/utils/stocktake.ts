import { validStockInteger } from '@/utils/stock'
import type { CountForm, Stocktake, StocktakeUpdate, StaleLine } from '@/types/stocktake'
import type { StockInteger } from '@/types/stock'
export const stocktakeForm = (value: Stocktake): CountForm => ({
  warehouseId: value.warehouseId,
  note: value.note ?? '',
  lines: value.lines.map((line) => ({
    productId: line.productId,
    productCode: line.productCode,
    productName: line.productName,
    unit: line.unit,
    systemQuantity: line.systemQuantity,
    countedQuantity: line.countedQuantity == null ? '' : String(line.countedQuantity),
    reason: line.reason ?? '',
  })),
})
export const countDifference = (quantity: string, baseline?: StockInteger): bigint | undefined =>
  quantity.trim() !== '' && validStockInteger(quantity) && baseline !== undefined
    ? BigInt(quantity.trim()) - BigInt(baseline)
    : undefined
export const validateStocktake = (
  form: CountForm,
  create = false,
  confirm = false,
): Record<string, string> => {
  const errors: Record<string, string> = {}
  if (!form.warehouseId) errors.warehouseId = 'required'
  if (form.note.length > 2000) errors.note = 'tooLong'
  if (form.lines.length < 1 || form.lines.length > 1000) errors.lines = 'lineLimit'
  const ids = new Set<string>()
  for (const line of form.lines) {
    const key = `lines.${line.productId}`
    if (!line.productId || ids.has(line.productId)) errors[key] = 'duplicate'
    ids.add(line.productId)
    if (create) continue
    const quantity = line.countedQuantity.trim()
    if (!quantity) {
      if (confirm) errors[key] = 'countRequired'
    } else if (!validStockInteger(quantity)) errors[key] = 'invalidQuantity'
    else if (line.systemQuantity === undefined) errors[key] = 'saveNewLine'
    else if (countDifference(quantity, line.systemQuantity) !== 0n && !line.reason.trim())
      errors[key] = 'reasonRequired'
    if (line.reason.length > 2000) errors[key] = 'tooLong'
  }
  return errors
}
export const stocktakeInput = (form: CountForm, version: StockInteger): StocktakeUpdate => ({
  version,
  note: form.note.trim() || undefined,
  lines: form.lines.map((line) => ({
    productId: line.productId,
    countedQuantity:
      line.countedQuantity.trim() === '' ? undefined : BigInt(line.countedQuantity.trim()),
    reason: line.reason.trim() || undefined,
  })),
})
export const parseStaleLines = (details: unknown): Record<string, StaleLine> => {
  const result: Record<string, StaleLine> = {}
  if (!details || typeof details !== 'object') return result
  for (const [key, value] of Object.entries(details)) {
    const match =
      /^lines\.([^.]+)\.(snapshotRevision|currentRevision|systemQuantity|currentQuantity)$/.exec(
        key,
      )
    if (!match || typeof value !== 'string') continue
    const productId = match[1]!
    const field = match[2]! as keyof StaleLine
    ;(result[productId] ??= {})[field] = value
  }
  return result
}
export const stocktakeFieldErrors = (
  code: string | undefined,
  details: unknown,
  lines: CountForm['lines'],
): Record<string, string> => {
  if (!details || typeof details !== 'object') return {}
  const values = details as Record<string, unknown>
  if (typeof values.productId === 'string')
    return { [`lines.${values.productId}`]: code ?? 'VALIDATION_ERROR' }
  const errors: Record<string, string> = {}
  for (const [key, value] of Object.entries(values)) {
    if (typeof value !== 'string') continue
    const match = /^lines(?:\[(\d+)\]|\.(\d+))\.(.+)$/.exec(key)
    const line = match ? lines[Number(match[1] ?? match[2])] : undefined
    errors[line ? `lines.${line.productId}` : key] = value
  }
  return errors
}
