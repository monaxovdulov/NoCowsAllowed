import configPrettier from 'eslint-config-prettier';
import metarhia from 'eslint-config-metarhia';
import globals from 'globals';

// Конфиг этапа 1 карты рефакторинга (docs/refactoring-map.md, D7):
// качество кода — eslint-config-metarhia, формат — Prettier.
// configPrettier идёт последним и гасит правила, конфликтующие с prettier.
export default [
  {
    ignores: [
      'node_modules/',
      '.venv/',
      'cow-skate-standalone.html',
      // base64-блоб данных: линтить и форматировать смысла нет
      'backend/app/static/game/assets.js',
      // вне рамок карты (§7): es5-файл, строгий metarhia-стиль не применяем
      'backend/app/static/telegram-bridge.js',
    ],
  },
  ...metarhia,
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      sourceType: 'module',
      globals: globals.browser,
    },
    rules: {
      // ES-модули неявно strict — директива 'use strict' не нужна
      strict: 'off',
      // X0/X1/P/A… — геометрические хелперы, не конструкторы;
      // полезная половина правила (newIsCap) сохранена
      'new-cap': ['error', { newIsCap: true, capIsNew: false }],
      // вложенные тернарники — компактный стиль горячего кода; разбор — этап 6
      'no-nested-ternary': 'off',
      // пустые catch без параметра чинит B4 на этапе 6 (catch (error) + warn)
      'no-unused-vars': ['error', { caughtErrors: 'none' }],
    },
  },
  configPrettier,
];
