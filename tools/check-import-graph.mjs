#!/usr/bin/env node
// Проверка ацикличности графа импортов game/*.js (карта рефакторинга,
// этап 3 — критерий). Циклы мешают тестировать модули по отдельности;
// после развязки событиями (D6) их быть не должно.
//
//   node tools/check-import-graph.mjs   # exit 1 и список циклов, если есть

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GAME = path.join(ROOT, 'backend', 'app', 'static', 'game');

const IMPORT_RE = /import\s+(?:[^'"]*\sfrom\s+)?['"](\.[^'"]+)['"]/g;

/** @returns {Map<string, string[]>} граф «файл → импортируемые файлы» */
function importGraph() {
  /** @type {string[]} */
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.js')) files.push(p);
    }
  };
  walk(GAME);
  const graph = new Map();
  for (const f of files) {
    const deps = [];
    for (const m of readFileSync(f, 'utf8').matchAll(IMPORT_RE)) {
      const dep = path.resolve(path.dirname(f), m[1]);
      if (dep.startsWith(GAME)) deps.push(path.relative(GAME, dep));
    }
    graph.set(path.relative(GAME, f), deps);
  }
  return graph;
}

/** @returns {string[][]} все элементарные циклы (по одному представителю) */
function findCycles(graph) {
  const cycles = [];
  const stack = [];
  const state = new Map(); // 'in-stack' | 'done'
  const visit = (node) => {
    if (state.get(node) === 'done') return;
    if (state.get(node) === 'in-stack') {
      cycles.push([...stack.slice(stack.indexOf(node)), node]);
      return;
    }
    state.set(node, 'in-stack');
    stack.push(node);
    for (const dep of graph.get(node) || []) visit(dep);
    stack.pop();
    state.set(node, 'done');
  };
  for (const node of graph.keys()) visit(node);
  return cycles;
}

const cycles = findCycles(importGraph());
if (cycles.length) {
  console.error('циклы импортов в game/:');
  for (const c of cycles) console.error(`  ${c.join(' → ')}`);
  process.exit(1);
}
console.log('граф импортов game/ ациклический');
