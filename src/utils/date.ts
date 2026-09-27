import dayjs, { type ConfigType } from 'dayjs'
import 'dayjs/locale/vi'

export const formatDate = (value: ConfigType): string =>
  value && dayjs(value).isValid() ? dayjs(value).format('DD/MM/YYYY') : ''

export const formatDateTime = (value: ConfigType): string =>
  value && dayjs(value).isValid() ? dayjs(value).format('DD/MM/YYYY HH:mm:ss') : ''

export const parseDate = (value: ConfigType): string | null =>
  value && dayjs(value).isValid() ? dayjs(value).toISOString() : null
