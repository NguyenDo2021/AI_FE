import type { Rule } from 'ant-design-vue/es/form'

export const validationRules = {
  required: (message: string): Rule => ({ required: true, message, trigger: 'blur' }),
  min: (min: number, message: string): Rule => ({ min, message, trigger: 'blur' }),
  max: (max: number, message: string): Rule => ({ max, message, trigger: 'blur' }),
  email: (message: string): Rule => ({ type: 'email', message, trigger: 'blur' }),
  phone: (message: string): Rule => ({
    pattern: /^\+?[0-9]{8,15}$/,
    message,
    trigger: 'blur',
  }),
  number: (message: string): Rule => ({ type: 'number', message, trigger: 'change' }),
  date: (message: string): Rule => ({ type: 'date', message, trigger: 'change' }),
}
