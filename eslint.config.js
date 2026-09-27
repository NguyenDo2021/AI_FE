import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import vue from 'eslint-plugin-vue'
import ts from 'typescript-eslint'
import globals from 'globals'

export default ts.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.{ts,vue}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { parser: ts.parser, extraFileExtensions: ['.vue'] },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'vue/multi-word-component-names': ['error', { ignores: ['index', '403', '404'] }],
      'vue/no-v-html': 'error',
    },
  },
  prettier,
)
