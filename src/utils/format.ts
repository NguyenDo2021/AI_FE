export const formatNumber = (value: number, locale = 'vi-VN'): string =>
  new Intl.NumberFormat(locale).format(value)

export const formatOrdinal = (index: number, page: number, pageSize: number): number =>
  (page - 1) * pageSize + index + 1
