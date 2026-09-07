import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  { ignores: ['dist/'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        __DEV__: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        FormData: 'readonly',
        Blob: 'readonly',
        File: 'readonly',
        FileReader: 'readonly',
        navigator: 'readonly',
        window: 'readonly',
        document: 'readonly',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    // Тесты. jest поднимает jest.mock(...) выше импортов, поэтому модуль,
    // который нужно получить уже подменённым, забирают через require() — и
    // делают это внутри самого теста, чтобы каждый случай видел свои подмены.
    // Это приём jest, а не недосмотр: запрет require() написан для кода
    // приложения, где модули грузит metro, и на тесты его распространили по
    // недоразумению — своего блока настроек у них до сих пор не было.
    files: ['src/__tests__/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  }
);
