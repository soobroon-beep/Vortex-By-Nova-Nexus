/* VORTEX · intérprete de Pine Script v5 (subconjunto)
   - Lexer + parser + evaluador propios. NO usa eval ni Function: el código pegado nunca se ejecuta como JavaScript.
   - Puro y sin DOM: corre igual en un Web Worker (aislado, con tiempo límite), en Node (pruebas) o en línea como último recurso.
   - Solo análisis: no hay órdenes reales. Lo que no soporta se avisa con su línea; nada se omite en silencio.
   - No promete equivalencia universal con TradingView: ver README (alcance y límites). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.CCTPine = api;
  if (typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined' && self instanceof WorkerGlobalScope) {
    self.onmessage = e => { // protocolo del Worker: {id, code, candles, opts} → {id, result}
      const m = e.data || {};
      try { self.postMessage({id: m.id, result: api.run(m.code, m.candles, m.opts || {})}); }
      catch (err) { self.postMessage({id: m.id, result: {ok: false, error: {msg: String(err && err.message || err), line: 0}}}); }
    };
  }
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

class PineError extends Error { constructor(msg, line) { const k = Error.stackTraceLimit; Error.stackTraceLimit = 0; super(msg); Error.stackTraceLimit = k; this.line = line || 0; this.pine = true; } } // sin pila: en modo tolerante se crean muchos
const isna = v => v === null || v === undefined || (typeof v === 'number' && v !== v);

/* ───────────── Reparación del texto pegado ─────────────
   Arregla lo que el copiar/pegar suele estropear y lo cuenta (nunca en silencio). */
function sanitize(src) {
  src = String(src).replace(/\r\n?/g, '\n'); const fixes = {}, first = {}; let line = 1, out = '', i = 0, str = null, cmt = false;
  { // números de línea copiados junto con el código («1 //@version=5», «2| indicator(…)»)
    const ls = src.split('\n'), ne = ls.filter(l => l.trim()), m = ne.filter(l => /^\s*\d{1,5}[.:|)]?(\s|$)/.test(l));
    if (ne.length >= 3 && m.length >= ne.length * 0.8 && /^\s*\d{1,5}[.:|)]?\s+(\/\/|indicator|study|strategy|library)/.test(ne[0])) { src = ls.map(l => l.replace(/^\s*\d{1,5}[.:|)]?(?: |\t|$)/, '')).join('\n'); fixes['números de línea pegados con el código eliminados'] = ne.length; first['números de línea pegados con el código eliminados'] = 1; }
  }
  const fx = (k, c) => { fixes[k] = (fixes[k] || 0) + 1; if (!first[k]) first[k] = line; };
  while (i < src.length) {
    const c = src[i];
    if (c === '\n') { line++; cmt = false; out += c; i++; continue; }
    if (/[\u00A0\u2007\u202F\u2009\u3000]/.test(c)) { out += ' '; fx('espacios especiales (no separables) cambiados por espacios normales'); i++; continue; }
    if (/[\u200B-\u200D\u2060\uFEFF]/.test(c)) { fx('caracteres invisibles eliminados'); i++; continue; }
    if (cmt) { out += c; i++; continue; }
    if (str) {
      if (c === '\\' && i + 1 < src.length) { out += c + src[i + 1]; i += 2; continue; }
      if (c === str.close || (str.smart && /[”“"]/.test(c) && str.smart)) { out += str.q; str = null; i++; continue; }
      out += c; i++; continue;
    }
    if (c === '/' && src[i + 1] === '/') { cmt = true; out += c; i++; continue; }
    if (c === '"' || c === "'") { str = {q: c, close: c}; out += c; i++; continue; }
    if (c === '“' || c === '”') { str = {q: '"', close: '”', smart: true}; out += '"'; fx('comillas tipográficas “ ” cambiadas por comillas rectas'); i++; continue; }
    if (c === '‘' || c === '’') { str = {q: "'", close: '’', smart: true}; out += "'"; fx('comillas tipográficas ‘ ’ cambiadas por comillas rectas'); i++; continue; }
    if (c === '–' || c === '—' || c === '−') { out += '-'; fx('guiones largos (– — −) cambiados por el signo menos'); i++; continue; }
    out += c; i++;
  }
  return {code: out, fixes: Object.keys(fixes).map(k => ({line: first[k], msg: `${fixes[k]} ${k}`}))};
}

/* ───────────── Lexer ───────────── */
const KW = new Set(['if', 'else', 'for', 'to', 'by', 'in', 'while', 'switch', 'var', 'varip', 'true', 'false', 'and', 'or', 'not', 'break', 'continue', 'import']);
// «type», «method», «enum» y «export» solo son palabras clave al empezar su declaración: muchos scripts los usan como nombre (ma(src, len, type) =>, method = input…)
const OPS = [':=', '==', '!=', '<=', '>=', '=>', '+=', '-=', '*=', '/=', '%=', '+', '-', '*', '/', '%', '<', '>', '=', '?', ':', '(', ')', '[', ']', ',', '.'];
const CONT_END = new Set(['+', '-', '*', '/', '%', '==', '!=', '<', '>', '<=', '>=', '=', '?', ':', ',', ':=', '+=', '-=', '*=', '/=', '%=']);
const START_RE = /(?:(?:and|or)(?![A-Za-z0-9_]))|==|!=|<=|>=|[?:*\/%<>.]|[+\-](?=\s)/y;

function lex(src) {
  src = String(src).replace(/\r\n?/g, '\n').replace(/^﻿/, '');
  const T = [], n = src.length, ind = [0]; let i = 0, line = 1, depth = 0, bol = true;
  const add = (t, v) => T.push({t, v, line});
  while (i < n) {
    if (bol) {
      bol = false; let w = 0;
      while (i < n && (src[i] === ' ' || src[i] === '\t')) { w += src[i] === '\t' ? 4 : 1; i++; }
      if (i >= n) break;
      if (src[i] === '\n') { i++; line++; bol = true; continue; }
      if (src[i] === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; if (i < n) { i++; line++; } bol = true; continue; }
      if (depth === 0 && T.length) {
        const last = T[T.length - 1];
        START_RE.lastIndex = i;
        const startsOp = START_RE.test(src);
        const endsOp = (last.t === 'op' && CONT_END.has(last.v)) || (last.t === 'id' && (last.v === 'and' || last.v === 'or' || last.v === 'not'));
        const cont = startsOp || endsOp || (w % 4 !== 0 && w > ind[ind.length - 1]);
        if (!cont) {
          if (last.t !== 'nl') add('nl');
          if (w > ind[ind.length - 1]) { ind.push(w); add('indent'); }
          else while (w < ind[ind.length - 1]) { ind.pop(); add('dedent'); }
        }
      }
      continue;
    }
    const ch = src[i];
    if (ch === '\n') { i++; line++; bol = true; continue; }
    if (ch === ' ' || ch === '\t') { i++; continue; }
    if (ch === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (ch === '"' || ch === "'") {
      let s = '', j = i + 1, nls = 0; // Pine admite textos que ocupan varias líneas
      while (j < n && src[j] !== ch) {
        if (src[j] === '\n') nls++;
        if (src[j] === '\\' && j + 1 < n) { const e = src[j + 1]; s += e === 'n' ? '\n' : e === 't' ? '\t' : e; j += 2; } else s += src[j++];
      }
      if (j >= n) throw new PineError('Texto sin cerrar', line);
      add('str', s); line += nls; i = j + 1; continue;
    }
    if (ch === '#') {
      const m = /#([0-9a-fA-F]{8}|[0-9a-fA-F]{6})(?![0-9a-zA-Z_])/y; m.lastIndex = i; const r = m.exec(src);
      if (!r) throw new PineError("Color hexadecimal no válido", line);
      add('color', r[1]); i += r[0].length; continue;
    }
    if ((ch >= '0' && ch <= '9') || (ch === '.' && src[i + 1] >= '0' && src[i + 1] <= '9')) {
      const m = /(\d+\.\d*|\.\d+|\d+)([eE][+-]?\d+)?/y; m.lastIndex = i; const r = m.exec(src);
      add('num', parseFloat(r[0])); i += r[0].length; continue;
    }
    if ((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || ch === '_') {
      let j = i + 1; while (j < n && /[A-Za-z0-9_]/.test(src[j])) j++;
      add('id', src.slice(i, j)); i = j; continue;
    }
    let hit = null; for (const op of OPS) if (src.startsWith(op, i)) { hit = op; break; }
    if (!hit) throw new PineError(`Carácter no reconocido «${ch}»`, line);
    if (hit === '(' || hit === '[') depth++; else if ((hit === ')' || hit === ']') && depth > 0) depth--;
    add('op', hit); i += hit.length;
  }
  if (T.length && T[T.length - 1].t !== 'nl') add('nl');
  while (ind.length > 1) { ind.pop(); add('dedent'); }
  add('eof'); return T;
}

/* ───────────── Parser ───────────── */
function parse(T) {
  let p = 0;
  const peek = (o = 0) => T[Math.min(p + o, T.length - 1)], next = () => T[p++];
  const isOp = (v, o = 0) => { const t = peek(o); return t.t === 'op' && t.v === v; };
  const isId = (v, o = 0) => { const t = peek(o); return t.t === 'id' && t.v === v; };
  const fail = (msg, t) => { throw new PineError(msg, (t || peek()).line); };
  const expectOp = v => { if (!isOp(v)) fail(`Se esperaba «${v}»`); return next(); };
  const identTok = () => { const t = next(); if (t.t !== 'id' || KW.has(t.v)) fail('Se esperaba un nombre', t); return t; };

  function endStmt() {
    const t = peek();
    if (t.t === 'nl') { next(); return; }
    if (t.t === 'op' && t.v === ',') { next(); return; } // «a := 1, b := 2»: varias sentencias en una línea
    if (t.t === 'eof' || t.t === 'dedent' || T[p - 1].t === 'dedent') return;
    fail('Se esperaba el fin de la línea');
  }
  function parseBlock() {
    if (peek().t === 'nl') next();
    if (peek().t !== 'indent') fail('Se esperaba un bloque indentado');
    next(); const body = [];
    while (peek().t !== 'dedent' && peek().t !== 'eof') { if (peek().t === 'nl') { next(); continue; } body.push(parseStatement()); }
    if (peek().t === 'dedent') next();
    return body;
  }
  function skipGeneric(j) { // T[j] es «<»; devuelve el índice tras el «>» que lo cierra
    let d = 0;
    for (let q = j; T[q].t !== 'eof' && T[q].t !== 'nl'; q++) {
      if (T[q].t === 'op' && T[q].v === '<') d++;
      else if (T[q].t === 'op' && T[q].v === '>') { d--; if (!d) return q + 1; }
    }
    return -1;
  }
  function looksLikeFn() {
    let q = p; if (isId('export')) q++;
    if (!(T[q].t === 'id' && T[q + 1].t === 'op' && T[q + 1].v === '(')) return false;
    let d = 0;
    for (q = q + 1; q < T.length; q++) {
      const tk = T[q];
      if (tk.t === 'nl' || tk.t === 'eof') return false;
      if (tk.t === 'op') {
        if (tk.v === '(' || tk.v === '[') d++;
        else if (tk.v === ')' || tk.v === ']') { d--; if (d === 0) return T[q + 1].t === 'op' && T[q + 1].v === '=>'; }
      }
    }
    return false;
  }
  function typeEnd(j) { // índice tras un tipo que empieza en T[j] («float», «chart.point[]», «array<ob>»), o -1
    if (T[j].t !== 'id' || KW.has(T[j].v)) return -1; j++;
    while (T[j].t === 'op' && T[j].v === '.' && T[j + 1].t === 'id') j += 2;
    if (T[j].t === 'op' && T[j].v === '<') { const q = skipGeneric(j); if (q < 0) return -1; j = q; }
    while (T[j].t === 'op' && T[j].v === '[' && T[j + 1].t === 'op' && T[j + 1].v === ']') j += 2;
    return j;
  }
  function skipTypes() { // quita los tipos/calificadores que preceden a un nombre
    for (;;) { const e = typeEnd(p); if (e > 0 && T[e].t === 'id' && !KW.has(T[e].v)) p = e; else return; }
  }
  function parseFn(isMethod) {
    const line = peek().line; if (isId('export')) next();
    if (isMethod) next();
    const name = next().v; expectOp('('); const params = [];
    while (!isOp(')')) {
      const st = p; skipTypes(); const type = p > st ? (T[st + 1].t === 'op' && (T[st + 1].v === '<' || T[st + 1].v === '[') ? 'array' : T[st].v) : null;
      const nm = identTok().v; let def = null;
      if (isOp('=')) { next(); def = parseExpr(); }
      params.push({name: nm, def, type});
      if (isOp(',')) next(); else break;
    }
    expectOp(')'); expectOp('=>');
    let body;
    if (peek().t === 'nl') body = parseBlock(); else { body = []; do { body.push(parseStatement()); } while (T[p - 1].t === 'op' && T[p - 1].v === ','); } // una línea: también «f(x) => var l = label.new(…)»
    return {k: 'fn', name, params, body, line, method: !!isMethod};
  }
  function parseEnum() {
    const line = next().line, name = identTok().v, fields = [];
    if (peek().t === 'nl') next(); if (peek().t !== 'indent') fail('Se esperaba la lista de valores indentada'); next();
    while (peek().t !== 'dedent' && peek().t !== 'eof') {
      if (peek().t === 'nl') { next(); continue; }
      const nm = identTok().v; let title = nm; if (isOp('=')) { next(); const e = parseExpr(); if (e.k === 'str') title = e.v; }
      endStmt(); fields.push({name: nm, title});
    }
    if (peek().t === 'dedent') next();
    return {k: 'enum', name, fields, line};
  }
  function parseType() {
    const line = next().line, name = identTok().v, fields = [];
    if (peek().t === 'nl') next(); if (peek().t !== 'indent') fail('Se esperaba la lista de campos indentada'); next();
    while (peek().t !== 'dedent' && peek().t !== 'eof') {
      if (peek().t === 'nl') { next(); continue; }
      if (isId('varip') || isId('var')) next(); // campos «varip int ticks = -1»
      skipTypes(); const nm = identTok().v; let def = null;
      if (isOp('=')) { next(); def = parseExpr(); }
      endStmt(); fields.push({name: nm, def});
    }
    if (peek().t === 'dedent') next();
    return {k: 'type', name, fields, line};
  }
  function tryDecl() {
    let j = p, mode = null;
    if (isId('var') || isId('varip')) { mode = T[j].v; j++; }
    for (;;) { const e = typeEnd(j); if (e > 0 && T[e].t === 'id' && !KW.has(T[e].v)) j = e; else break; }
    const nm = T[j], eq = T[j + 1];
    if (nm.t === 'id' && !KW.has(nm.v) && eq.t === 'op' && eq.v === '=') {
      const line = nm.line; p = j + 2; const init = parseExpr(); endStmt();
      return {k: 'decl', name: nm.v, init, mode, line};
    }
    if (mode) fail('Declaración no válida');
    return null;
  }
  function parseIf() {
    const line = next().line, cond = parseExpr(), then = parseBlock(); let els = null;
    if (isId('else')) { next(); els = isId('if') ? [parseIf()] : parseBlock(); }
    return {k: 'if', cond, then, els, line};
  }
  function parseFor() {
    const line = next().line;
    // Pine permite tipar la variable del bucle: «for int i = 0 to n», «for float x in arr», «for [int i, float x] in arr»
    if (isOp('[')) { next(); skipTypes(); const a = identTok().v; expectOp(','); skipTypes(); const b = identTok().v; expectOp(']'); if (!isId('in')) fail("Se esperaba «in»"); next(); const it = parseExpr(); return {k: 'forin', idx: a, v: b, iter: it, body: parseBlock(), line}; }
    skipTypes(); const v = identTok().v;
    if (isId('in')) { next(); const it = parseExpr(); return {k: 'forin', idx: null, v, iter: it, body: parseBlock(), line}; }
    expectOp('='); const from = parseExpr(); if (!isId('to')) fail("Se esperaba «to»"); next(); const to = parseExpr(); let by = null;
    if (isId('by')) { next(); by = parseExpr(); }
    return {k: 'for', v, from, to, by, body: parseBlock(), line};
  }
  function parseSwitch() {
    const line = next().line; let subject = null;
    if (peek().t !== 'nl') subject = parseExpr();
    if (peek().t === 'nl') next(); if (peek().t !== 'indent') fail('Se esperaba un bloque indentado'); next();
    const cases = [];
    while (peek().t !== 'dedent' && peek().t !== 'eof') {
      if (peek().t === 'nl') { next(); continue; }
      let test = null; if (!isOp('=>')) test = parseExpr();
      expectOp('=>'); let body;
      if (peek().t === 'nl') body = parseBlock(); else { body = []; do { body.push(parseStatement()); } while (T[p - 1].t === 'op' && T[p - 1].v === ','); }
      cases.push({test, body});
    }
    if (peek().t === 'dedent') next();
    return {k: 'switch', subject, cases, line};
  }
  function parseStatement() {
    const t = peek(), line = t.line;
    if (t.t === 'id') {
      switch (t.v) {
        case 'if': return parseIf();
        case 'for': return parseFor();
        case 'while': { next(); const cond = parseExpr(); return {k: 'while', cond, body: parseBlock(), line}; }
        case 'switch': return parseSwitch();
        case 'break': next(); endStmt(); return {k: 'break', line};
        case 'continue': next(); endStmt(); return {k: 'continue', line};
        case 'import': { // import Autor/Biblioteca/versión [as alias]
          next(); let raw = ''; while (peek().t !== 'nl' && peek().t !== 'eof' && !isId('as')) raw += next().v; // «Autor-Con-Guion/Biblioteca/2»
          let alias = null; if (isId('as')) { next(); alias = identTok().v; }
          const mm = /^([\w-]+)\/([\w-]+)\/(\d+)$/.exec(raw); if (!mm) fail('import debe ser «Autor/Biblioteca/versión»');
          endStmt(); return {k: 'import', lib: mm[1] + '/' + mm[2], ver: +mm[3], alias: alias || mm[2], line};
        }
        case 'type': case 'enum': if (T[p + 1].t === 'id' && (T[p + 2].t === 'nl' || T[p + 2].t === 'indent')) return t.v === 'type' ? parseType() : parseEnum(); break;
        case 'method': if (T[p + 1].t === 'id' && T[p + 2].t === 'op' && T[p + 2].v === '(') return parseFn(true); break;
        case 'export': if (T[p + 1].t === 'id' && !(T[p + 2].t === 'op' && /^(=|:=)$/.test(T[p + 2].v))) { next(); return parseStatement(); } break;
      }
      if (looksLikeFn()) return parseFn();
      const d = tryDecl(); if (d) return d;
      if (peek().t === 'id' && !KW.has(peek().v)) {
        const o = peek(1);
        if (o.t === 'op' && (o.v === ':=' || o.v === '+=' || o.v === '-=' || o.v === '*=' || o.v === '/=' || o.v === '%=')) {
          const name = next().v; next(); const e = parseExpr(); endStmt();
          return {k: 'assign', name, op: o.v, e, line};
        }
      }
    } else if (isOp('[')) { // [a, b] = f()
      let q = p + 1; const names = [];
      while (T[q].t === 'id' && !KW.has(T[q].v)) { names.push(T[q].v); q++; if (T[q].t === 'op' && T[q].v === ',') q++; else break; }
      if (names.length && T[q].t === 'op' && T[q].v === ']' && T[q + 1].t === 'op' && T[q + 1].v === '=') {
        p = q + 2; const init = parseExpr(); endStmt(); return {k: 'tdecl', names, init, line};
      }
    }
    const e = parseExpr();
    if (e.k === 'mem' && peek().t === 'op' && [':=', '+=', '-=', '*=', '/=', '%='].includes(peek().v)) { const o = next(); const rhs = parseExpr(); endStmt(); return {k: 'fassign', target: e, op: o.v, e: rhs, line}; }
    endStmt(); return {k: 'expr', e, line};
  }

  function parseExpr() { return parseTernary(); }
  function parseTernary() {
    const c = parseOr();
    if (isOp('?')) { const line = next().line; const a = parseTernary(); expectOp(':'); const b = parseTernary(); return {k: 'tern', c, a, b, line}; }
    return c;
  }
  function parseOr() { let l = parseAnd(); while (isId('or')) { const line = next().line; l = {k: 'bin', op: 'or', l, r: parseAnd(), line}; } return l; }
  function parseAnd() { let l = parseCmp(); while (isId('and')) { const line = next().line; l = {k: 'bin', op: 'and', l, r: parseCmp(), line}; } return l; }
  function parseCmp() {
    let l = parseAdd();
    while (peek().t === 'op' && ['==', '!=', '<', '<=', '>', '>='].includes(peek().v)) { const o = next(); l = {k: 'bin', op: o.v, l, r: parseAdd(), line: o.line}; }
    return l;
  }
  function parseAdd() { let l = parseMul(); while (isOp('+') || isOp('-')) { const o = next(); l = {k: 'bin', op: o.v, l, r: parseMul(), line: o.line}; } return l; }
  function parseMul() { let l = parseUnary(); while (isOp('*') || isOp('/') || isOp('%')) { const o = next(); l = {k: 'bin', op: o.v, l, r: parseUnary(), line: o.line}; } return l; }
  function parseUnary() {
    if (isOp('-') || isOp('+')) { const o = next(); return {k: 'un', op: o.v, e: parseUnary(), line: o.line}; }
    if (isId('not')) { const o = next(); return {k: 'un', op: 'not', e: parseUnary(), line: o.line}; }
    return parsePostfix();
  }
  function parsePostfix() {
    let e = parsePrimary();
    for (;;) {
      const line = peek().line;
      if (T[p - 1].t === 'dedent' || T[p - 1].t === 'nl') break; // tras un bloque (switch/if/for como valor) la línea siguiente es otra sentencia, no «[…]» ni «(…)» de este valor
      if (isOp('(')) {
        next(); const args = [];
        while (!isOp(')')) {
          if (peek().t === 'id' && isOp('=', 1)) { const name = next().v; next(); args.push({name, e: parseExpr()}); }
          else args.push({e: parseExpr()});
          if (isOp(',')) next(); else break;
        }
        expectOp(')'); e = {k: 'call', fn: e, args, line};
      } else if (isOp('[')) { next(); const idx = parseExpr(); expectOp(']'); e = {k: 'idx', obj: e, idx, line}; }
      else if (isOp('.')) { next(); const t = next(); if (t.t !== 'id') fail('Se esperaba un nombre tras «.»', t); e = {k: 'mem', obj: e, prop: t.v, line}; }
      else if (isOp('<') && (e.k === 'mem' || e.k === 'id')) { const j = skipGeneric(p); if (j < 0 || !T.slice(p + 1, j - 1).every(t => (t.t === 'id' && !KW.has(t.v)) || (t.t === 'op' && /^[,.<>\[\]]$/.test(t.v))) || !(T[j].t === 'op' && (T[j].v === '(' || (T[j].v === '.' && e.k === 'id')))) break; p = j; } // array.from<string>(…), array<Point>.new(), map.new<string, float>()
      else break;
    }
    return e;
  }
  function parsePrimary() {
    const t = next(), line = t.line;
    switch (t.t) {
      case 'num': return {k: 'num', v: t.v, line};
      case 'str': return {k: 'str', v: t.v, line};
      case 'color': return {k: 'color', v: t.v, line};
      case 'op':
        if (t.v === '(') { const e = parseExpr(); expectOp(')'); return e; }
        if (t.v === '[') { const items = []; while (!isOp(']')) { items.push(parseExpr()); if (isOp(',')) next(); else break; } expectOp(']'); return {k: 'tup', items, line}; }
        break;
      case 'id':
        if (t.v === 'true' || t.v === 'false') return {k: 'bool', v: t.v === 'true', line};
        if (t.v === 'if') { p--; return {k: 'bx', s: parseIf(), line}; }
        if (t.v === 'for') { p--; return {k: 'bx', s: parseFor(), line}; }
        if (t.v === 'switch') { p--; return {k: 'bx', s: parseSwitch(), line}; }
        if (t.v === 'while') { p--; const l = next().line, cond = parseExpr(); return {k: 'bx', s: {k: 'while', cond, body: parseBlock(), line: l}, line}; }
        if (KW.has(t.v)) fail(`«${t.v}» no se puede usar aquí`, t);
        return {k: 'id', name: t.v, line};
    }
    fail('Expresión no válida', t);
  }
  const body = []; while (peek().t !== 'eof') { if (peek().t === 'nl' || peek().t === 'dedent' || peek().t === 'indent') { next(); continue; } body.push(parseStatement()); }
  return body;
}

/* ───────────── Colores ───────────── */
class Col { constructor(r, g, b, t) { this.r = r; this.g = g; this.b = b; this.t = t || 0; } }
const hexCol = h => { h = h.replace('#', ''); return new Col(parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), h.length === 8 ? (1 - parseInt(h.slice(6, 8), 16) / 255) * 100 : 0); };
const NAMED = {aqua: '00BCD4', black: '363A45', blue: '2962FF', fuchsia: 'E040FB', gray: '787B86', green: '4CAF50', lime: '00E676', maroon: '880E4F', navy: '311B92', olive: '808000', orange: 'FF9800', purple: '9C27B0', red: 'F23645', silver: 'B2B5BE', teal: '00897B', white: 'FFFFFF', yellow: 'FFEB3B'};
const clamp01 = x => Math.max(0, Math.min(1, x));

/* ───────────── Entorno de ejecución ───────────── */
class Tup { constructor(a) { this.a = a; } }
class V { constructor(isVar) { this.cur = null; this.hist = []; this.isVar = isVar; this.done = false; } }
class Frame {
  constructor() { this.vars = new Map(); this.st = new Map(); }
  slot(node, isVar) { let v = this.vars.get(node); if (!v) { v = new V(!!isVar); this.vars.set(node, v); } return v; }
  state(node) { let s = this.st.get(node); if (!s) { s = {}; this.st.set(node, s); } return s; }
}
const truthy = v => v !== null && v !== undefined && v !== false && v !== 0 && v === v;
const SERIES = new Set(['open', 'high', 'low', 'close', 'volume', 'hl2', 'hlc3', 'ohlc4', 'hlcc4', 'time', 'bar_index']);
function seriesAt(ctx, name, i) {
  const c = ctx.candles[i]; if (!c) return null;
  switch (name) {
    case 'open': return c.o; case 'high': return c.h; case 'low': return c.l; case 'close': return c.c; case 'volume': return c.v;
    case 'hl2': return (c.h + c.l) / 2; case 'hlc3': return (c.h + c.l + c.c) / 3; case 'ohlc4': return (c.o + c.h + c.l + c.c) / 4; case 'hlcc4': return (c.h + c.l + 2 * c.c) / 4;
    case 'time': return c.t; case 'bar_index': return i;
  }
  return null;
}
const dt = ctx => new Date(ctx.candles[ctx.bar].t);
const BVARS = Object.assign(Object.create(null), {
  last_bar_index: c => c.n - 1, last_bar_time: c => c.candles[c.n - 1].t, timenow: c => Date.now(),
  time_close: c => c.candles[c.bar].t + c.ms, time_tradingday: c => { const d = dt(c); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); },
  dayofmonth: c => dt(c).getUTCDate(), dayofweek: c => dt(c).getUTCDay() + 1, hour: c => dt(c).getUTCHours(), minute: c => dt(c).getUTCMinutes(),
  second: c => dt(c).getUTCSeconds(), month: c => dt(c).getUTCMonth() + 1, year: c => dt(c).getUTCFullYear(),
  weekofyear: c => { const d = dt(c), s = Date.UTC(d.getUTCFullYear(), 0, 1); return Math.floor((d.getTime() - s) / 864e5 / 7) + 1; }
});
const ENUM_NS = new Set(['plot', 'hline', 'line', 'label', 'box', 'shape', 'location', 'size', 'xloc', 'yloc', 'extend', 'text', 'position', 'format', 'currency', 'session', 'barmerge', 'order', 'display', 'adjustment', 'backadjustment', 'settlement_as_close', 'scale', 'alert', 'font']);
const KNOWN_ROOTS = new Set(['ta', 'math', 'str', 'array', 'color', 'input', 'request', 'strategy', 'timeframe', 'syminfo', 'barstate', 'table', 'matrix', 'map', 'chart', 'ticker', 'runtime', 'log', 'dividends', 'earnings', 'splits']);
const TF_MIN = Object.assign(Object.create(null), {'1m': 1, '3m': 3, '5m': 5, '15m': 15, '30m': 30, '1h': 60, '2h': 120, '4h': 240, '6h': 360, '8h': 480, '12h': 720, '1d': 1440, '3d': 4320, '1w': 10080, '1M': 43200});
const tfPeriod = iv => { const m = TF_MIN[iv]; if (!m) return iv || '60'; return iv === '1M' ? 'M' : iv === '1w' ? 'W' : iv === '1d' ? 'D' : iv === '3d' ? '3D' : String(m); };
const CONSTS = Object.assign(Object.create(null), {
  'math.pi': Math.PI, 'math.e': Math.E, 'math.phi': 1.6180339887498948, 'math.rphi': 0.6180339887498948,
  'barstate.isfirst': c => c.bar === 0, 'barstate.islast': c => c.bar === c.n - 1, 'barstate.ishistory': c => c.bar < c.n - 1, 'barstate.isrealtime': c => c.bar === c.n - 1,
  'barstate.isconfirmed': c => true, 'barstate.isnew': c => true, 'barstate.islastconfirmedhistory': c => c.bar === c.n - 1,
  'timeframe.period': c => tfPeriod(c.interval), 'timeframe.multiplier': c => { const m = TF_MIN[c.interval] || 60; return m >= 43200 ? 1 : m >= 10080 ? m / 10080 : m >= 1440 ? m / 1440 : m; },
  'timeframe.isintraday': c => (TF_MIN[c.interval] || 60) < 1440, 'timeframe.isdaily': c => c.interval === '1d' || c.interval === '3d', 'timeframe.isweekly': c => c.interval === '1w', 'timeframe.ismonthly': c => c.interval === '1M',
  'timeframe.isdwm': c => (TF_MIN[c.interval] || 60) >= 1440, 'timeframe.isseconds': false, 'timeframe.isminutes': c => (TF_MIN[c.interval] || 60) < 1440,
  'syminfo.ticker': c => c.symbol, 'syminfo.tickerid': c => (SEC_NAME[c.exch] || 'BINANCE') + ':' + String(c.symbol).replace(/[-_]/g, '') + (SEC_PERP[String(c.exch).replace(/f$/, '')] === c.exch ? '.P' : ''), 'syminfo.prefix': c => SEC_NAME[c.exch] || 'BINANCE', 'syminfo.currency': c => /USDT$/.test(c.symbol) ? 'USDT' : 'USD',
  'syminfo.basecurrency': c => String(c.symbol).replace(/[-_]/g, '').replace(/USDT$|USD$/, ''), 'syminfo.root': c => String(c.symbol).replace(/[-_]/g, '').replace(/USDT$|USDC$|USD$|BUSD$/, ''), 'syminfo.ticker': c => c.symbol, 'syminfo.type': 'crypto', 'syminfo.volumetype': 'base', 'syminfo.description': c => String(c.symbol).replace(/[-_]/g, '').replace(/USDT$/, ' / TetherUS'), 'syminfo.sector': '', 'syminfo.industry': '', 'syminfo.country': '', 'syminfo.minmove': 1, 'syminfo.pricescale': c => Math.round(1 / (c.mintick || 0.01)), 'syminfo.main_tickerid': c => (SEC_NAME[c.exch] || 'BINANCE') + ':' + String(c.symbol).replace(/[-_]/g, ''), 'syminfo.employees': null, 'syminfo.shareholders': null, 'syminfo.shares_outstanding_float': null, 'syminfo.shares_outstanding_total': null, 'syminfo.expiration_date': null, 'syminfo.current_contract': null, 'syminfo.isin': '', 'syminfo.mincontract': 0,
  'chart.left_visible_bar_time': c => { const v = c.opts.visible; if (v && v.from != null) return v.from; return c.candles[Math.max(0, c.n - 150)].t; }, 'chart.right_visible_bar_time': c => { const v = c.opts.visible; if (v && v.to != null) return v.to; return c.candles[c.n - 1].t; }, 'chart.is_line': false, 'chart.is_range': false, 'chart.is_pnf': false, 'chart.is_kagi': false, 'chart.is_linebreak': false, 'syminfo.mintick': c => c.mintick, 'syminfo.pointvalue': 1, 'syminfo.session': '24x7', 'syminfo.timezone': 'Etc/UTC',
  'chart.fg_color': hexCol('D1D4DC'), 'chart.bg_color': hexCol('131722'), 'chart.is_standard': true, 'chart.is_heikinashi': false, 'chart.is_renko': false,
  'display.none': 0, 'display.pane': 1, 'display.data_window': 2, 'display.price_scale': 4, 'display.status_line': 8, 'display.all': 15, 'display.pine_screener': 16,
  'dayofweek.sunday': 1, 'dayofweek.monday': 2, 'dayofweek.tuesday': 3, 'dayofweek.wednesday': 4, 'dayofweek.thursday': 5, 'dayofweek.friday': 6, 'dayofweek.saturday': 7,
  'input.integer': 'int', 'input.float': 'float', 'input.bool': 'bool', 'input.string': 'string', 'input.source': 'source', 'input.resolution': 'timeframe', 'input.timeframe': 'timeframe', 'input.session': 'session', 'input.symbol': 'symbol', 'input.color': 'color', 'input.price': 'price', 'input.time': 'time', 'input.text_area': 'text_area',
  'strategy.long': 'long', 'strategy.short': 'short'
});
for (const k in NAMED) CONSTS['color.' + k] = hexCol(NAMED[k]);
const CONST_DYN = Object.create(null); // series “variables” de ta.* con estado propio (ver builtins)

const OLDVAR = Object.assign(Object.create(null), {tickerid: 'syminfo.tickerid', ticker: 'syminfo.ticker', period: 'timeframe.period', interval: 'timeframe.multiplier', isintraday: 'timeframe.isintraday', isdaily: 'timeframe.isdaily', isweekly: 'timeframe.isweekly', ismonthly: 'timeframe.ismonthly', isdwm: 'timeframe.isdwm', mintick: 'syminfo.mintick', n: 'bar_index'});
// nombres sueltos de Pine v1–v4: tipos de input (type=integer), estilos de plot (style=line) y variables de ta.* sin prefijo
const OLDNAME = Object.assign(Object.create(null), {integer: 'int', bool: 'bool', float: 'float', string: 'string', source: 'source', resolution: 'timeframe', symbol: 'symbol', session: 'session',
  line: 'style_line', linebr: 'style_linebr', stepline: 'style_stepline', histogram: 'style_histogram', cross: 'style_cross', area: 'style_area', areabr: 'style_areabr', columns: 'style_columns', circles: 'style_circles',
  dashed: 'style_dashed', dotted: 'style_dotted', solid: 'style_solid'});
const OLDTA = new Set(['obv', 'accdist', 'pvt', 'nvi', 'pvi', 'wad', 'wvad', 'iii', 'vwap']);
const lookup = (env, name) => { for (let s = env.scope; s; s = s.up) { const v = s.m.get(name); if (v) return v; } return null; };
const histAt = (ctx, v, off) => { if (off === 0) return v.cur; if (off < 0) return null; const i = ctx.bar - off; if (i < 0) return null; const h = v.hist[i]; return h === undefined ? null : h; };
function warn(ctx, line, msg, key, level) { const k = key || msg; if (ctx.wkeys.has(k)) return; ctx.wkeys.add(k); ctx.warnings.push({line: line || 0, msg, level: level || 'warn'}); }
function dotted(n) { if (n._dp !== undefined) return n._dp; const o = n, parts = []; while (n.k === 'mem') { parts.unshift(n.prop); n = n.obj; } if (n.k !== 'id') return (o._dp = null); parts.unshift(n.name); o._dp = parts; o._full = parts.join('.'); return parts; }
function tick(ctx, line) { if ((++ctx.steps & 0xfff) === 0 && Date.now() > ctx.deadline) { const e = new PineError('El script tardó demasiado y se detuvo (límite de tiempo)', line); e.fatal = true; throw e; } }

function binop(op, l, r, line) {
  if (op === '+' && (typeof l === 'string' || typeof r === 'string')) return (isna(l) ? 'NaN' : String(l)) + (isna(r) ? 'NaN' : String(r));
  if (op === '==' || op === '!=') {
    if (isna(l) || isna(r)) return null;
    const eq = l instanceof Col && r instanceof Col ? (l.r === r.r && l.g === r.g && l.b === r.b && l.t === r.t) : l === r;
    return op === '==' ? eq : !eq;
  }
  if (isna(l) || isna(r)) return null;
  if (typeof l === 'string' || typeof r === 'string') {
    if (op === '<') return l < r; if (op === '>') return l > r; if (op === '<=') return l <= r; if (op === '>=') return l >= r;
    throw new PineError(`Operador «${op}» no válido con texto`, line);
  }
  if (typeof l === 'boolean') l = +l; if (typeof r === 'boolean') r = +r;
  if (typeof l !== 'number' || typeof r !== 'number') throw new PineError(`Operador «${op}» no válido con estos tipos`, line);
  let v;
  switch (op) {
    case '+': v = l + r; break; case '-': v = l - r; break; case '*': v = l * r; break; case '/': v = l / r; break; case '%': v = l % r; break;
    case '<': return l < r; case '>': return l > r; case '<=': return l <= r; case '>=': return l >= r;
  }
  return Number.isFinite(v) ? v : null;
}

function evId(n, env) {
  const v = lookup(env, n.name); if (v) return v.cur;
  const ctx = env.ctx, name = n.name;
  if (name === 'na') return null;
  if (SERIES.has(name)) return seriesAt(ctx, name, ctx.bar);
  if (BVARS[name]) return BVARS[name](ctx);
  if (name === 'tr') return CONST_DYN['ta.tr'](ctx, env.frame.state(n));
  if (OLDVAR[name] && !ctx.fns.has(name)) { const to = OLDVAR[name]; warn(ctx, n.line, `${name} (sintaxis antigua) → ${to}`, 'fixv:' + name, 'fix'); return to in CONSTS ? (typeof CONSTS[to] === 'function' ? CONSTS[to](ctx) : CONSTS[to]) : to === 'bar_index' ? ctx.bar : null; }
  if (OLDTA.has(name) && !ctx.fns.has(name)) { warn(ctx, n.line, `${name} (sintaxis antigua) → ta.${name}`, 'fixv:' + name, 'fix'); return CONST_DYN['ta.' + name](ctx, env.frame.state(n)); }
  if (OLDNAME[name] && !ctx.fns.has(name)) { warn(ctx, n.line, `${name} (sintaxis antigua) → ${OLDNAME[name]}`, 'fixv:' + name, 'fix'); return OLDNAME[name]; }
  if (Object.prototype.hasOwnProperty.call(NAMED, name) && !ctx.fns.has(name)) { warn(ctx, n.line, `Color «${name}» (sintaxis antigua) → color.${name}`, 'fixc:' + name, 'fix'); return CONSTS['color.' + name]; }
  if (ctx.fns.has(name)) throw new PineError(`«${name}» es una función; falta llamarla con ()`, n.line);
  throw new PineError(`Variable no definida «${name}»`, n.line);
}
function evMem(n, env) {
  const ctx = env.ctx, parts = dotted(n);
  if (parts && !lookup(env, parts[0])) {
    const full = n._full;
    if (full in CONSTS) { const c = CONSTS[full]; return typeof c === 'function' ? c(ctx) : c; }
    if (CONST_DYN[full]) return CONST_DYN[full](ctx, env.frame.state(n));
    if (ctx.enums && ctx.enums.has(parts[0]) && parts.length === 2) { const en = ctx.enums.get(parts[0]); if (!en.fields.some(f => f.name === parts[1])) throw new PineError(`El enum ${parts[0]} no tiene el valor «${parts[1]}»`, n.line); return full; }
    if (ENUM_NS.has(parts[0]) && parts.length === 2) return parts[1];
    if (parts[0] === 'strategy' && parts.length >= 2) return full.replace(/^strategy\./, ''); // constantes de strategy (percent_of_equity, cash, direction.long…): sin efecto en un indicador
    if (ctx.libs && ctx.libs.has(parts[0])) { warn(ctx, n.line, `«${full}» es de la biblioteca «${ctx.libs.get(parts[0])}»: se usa na`, 'libv:' + full, 'unsupported'); ctx.incomplete = true; return null; }
    if (KNOWN_ROOTS.has(parts[0])) { warn(ctx, n.line, `«${full}» no está soportado todavía: se usa na`, 'v:' + full, 'unsupported'); ctx.incomplete = true; return null; }
    throw new PineError(`Variable no definida «${parts[0]}»`, n.line);
  }
  const o = ev(n.obj, env);
  if (o && typeof o === 'object' && o._t) { const v = o[n.prop]; return v === undefined ? null : v; }
  if (parts && n._full in CONSTS) { const c = CONSTS[n._full]; return typeof c === 'function' ? c(ctx) : c; } // p. ej. un parámetro llamado «size» o «color» y luego size.small / color.red
  if (parts && CONST_DYN[n._full]) return CONST_DYN[n._full](ctx, env.frame.state(n));
  if (parts && parts.length === 2 && ENUM_NS.has(parts[0])) return parts[1];
  if (o && o._kind === 'point' && PT_F[n.prop]) { const v = o[PT_F[n.prop]]; return v === undefined ? null : v; } // chart.point: .index .time .price
  if (isna(o)) { warn(ctx, n.line, `Se leyó «.${n.prop}» de un objeto na: devuelve na`, 'nafield:' + n.prop, 'fix'); return null; } // TradingView lo tolera en la mayoría de los casos (objetos aún no creados)
  throw new PineError(`No se puede leer «.${n.prop}» de este valor`, n.line);
}

function ev(n, env) {
  const ctx = env.ctx; tick(ctx, n.line);
  switch (n.k) {
    case 'num': case 'str': case 'bool': return n.v;
    case 'color': return n.c || (n.c = hexCol(n.v));
    case 'id': return evId(n, env);
    case 'mem': return evMem(n, env);
    case 'tup': return new Tup(n.items.map(x => ev(x, env)));
    case 'un': {
      const v = ev(n.e, env);
      if (n.op === 'not') return isna(v) ? (env.ctx.v6 ? true : null) : !truthy(v); // v6: un bool nunca es na (na cuenta como false)
      if (isna(v)) return null;
      if (typeof v !== 'number') throw new PineError(`«${n.op}» solo se aplica a números`, n.line);
      return n.op === '-' ? -v : v;
    }
    case 'bin': {
      if (n.op === 'and') return truthy(ev(n.l, env)) ? truthy(ev(n.r, env)) : false;
      if (n.op === 'or') return truthy(ev(n.l, env)) ? true : truthy(ev(n.r, env));
      return binop(n.op, ev(n.l, env), ev(n.r, env), n.line);
    }
    case 'tern': return truthy(ev(n.c, env)) ? ev(n.a, env) : ev(n.b, env);
    case 'idx': {
      const k = ev(n.idx, env), off = isna(k) ? null : Math.trunc(k), o = n.obj;
      if (o.k === 'id') {
        const v = lookup(env, o.name);
        if (v) return off === null ? null : histAt(ctx, v, off);
        if (SERIES.has(o.name)) return off === null || off < 0 ? null : seriesAt(ctx, o.name, ctx.bar - off);
      }
      if (o.k === 'mem' && o.obj.k === 'id') { // campo de un objeto con historial (b.h[k]): se toma el objeto tal como estaba k barras atrás.
        // Antes solo se guardaba el valor cuando esta misma línea se ejecutaba en cada barra, así que dentro de «if barstate.islast» + bucle devolvía siempre la barra actual (p. ej. el perfil de volumen del Nova Nexus acumulaba todo en las 2 filas de arriba)
        const bv = lookup(env, o.obj.name);
        if (bv && bv.cur && typeof bv.cur === 'object' && bv.cur._t) {
          if (off === null) return null;
          const ob = histAt(ctx, bv, off); if (!ob || typeof ob !== 'object' || !ob._t) return null;
          const x = ob[o.prop]; return x === undefined ? null : x;
        }
      }
      const val = ev(o, env);
      if (Array.isArray(val)) return off === null ? null : (val[off] === undefined ? null : val[off]);
      if (off === null) return null;
      const st = env.frame.state(n); if (!st.h) st.h = [];
      if (st.bar !== ctx.bar) { st.h[ctx.bar] = val; st.bar = ctx.bar; }
      if (off === 0) return val; if (off < 0) return null;
      const r = st.h[ctx.bar - off]; return r === undefined ? null : r;
    }
    case 'call': return evCall(n, env);
    case 'bx': return exec(n.s, env);
  }
  throw new PineError('Expresión no soportada: ' + n.k, n.line);
}

/* Modo tolerante: un error en tiempo de ejecución (índice fuera del array, objeto na, tipo inesperado…) ya no detiene todo el indicador
   como en TradingView: se salta esa sentencia en esa vela, se avisa con su línea y el resto sigue dibujándose. Solo detienen el script
   el límite de tiempo y runtime.error() (el autor lo pidió a propósito). La variable que no se pudo calcular queda en na. */
const STATIC_ERR = /Variable no definida|no es una función|falta llamarla|no tiene el valor|no tiene el campo|no se puede usar aquí|demasiad|memoria|Para recibir varios/; // errores del código (no de los datos): sí detienen
function execBlock(stmts, env) {
  let val = null;
  for (const s of stmts) {
    try { val = exec(s, env); }
    catch (e) {
      if (!e.pine || e.fatal || env.ctx.strict || STATIC_ERR.test(e.message)) throw e;
      const ctx = env.ctx; ctx.rtErrors = (ctx.rtErrors || 0) + 1; ctx.incomplete = true;
      warn(ctx, e.line || s.line, `Error en la vela ${ctx.bar + 1}: ${e.message} (se omite esa parte y el resto sigue)`, 'rt:' + (e.line || s.line) + ':' + e.message.replace(/\d+/g, 'N'), 'unsupported');
      if (s.k === 'decl') { const v = env.frame.slot(s, s.mode !== null); if (!v.done || !s.mode) { v.cur = null; v.done = true; } env.scope.m.set(s.name, v); }
      else if (s.k === 'tdecl') { if (!s.keys) s.keys = s.names.map(() => ({})); s.names.forEach((nm, i) => { const v = env.frame.slot(s.keys[i], false); v.cur = null; env.scope.m.set(nm, v); }); }
      val = null;
    }
    if (env.ctx.ctrl) break;
  }
  return val;
}
const sub = env => ({ctx: env.ctx, scope: {m: new Map(), up: env.scope}, frame: env.frame});
function loopCtl(ctx) { if (ctx.ctrl === 'break') { ctx.ctrl = null; return true; } if (ctx.ctrl === 'continue') ctx.ctrl = null; return false; }
function exec(s, env) {
  const ctx = env.ctx; tick(ctx, s.line);
  switch (s.k) {
    case 'expr': return ev(s.e, env);
    case 'decl': {
      const v = env.frame.slot(s, s.mode !== null);
      if (s.mode && v.done) { env.scope.m.set(s.name, v); return v.cur; }
      if (!lookup(env, s.name)) env.scope.m.set(s.name, v); // la declaración puede leer su propio historial: «float ji = … nz(ji[1])»
      const val = ev(s.init, env); if (val instanceof Tup) throw new PineError('Para recibir varios valores usa [a, b] = …', s.line);
      v.cur = val; v.done = true; env.scope.m.set(s.name, v); return val;
    }
    case 'tdecl': {
      let val = ev(s.init, env);
      if (isna(val)) val = new Tup([]); // valores no disponibles (na) → todas las variables quedan en na
      if (!(val instanceof Tup)) throw new PineError('La expresión no devuelve varios valores', s.line);
      if (!s.keys) s.keys = s.names.map(() => ({}));
      s.names.forEach((nm, i) => { const v = env.frame.slot(s.keys[i], false); v.cur = val.a[i] === undefined ? null : val.a[i]; env.scope.m.set(nm, v); });
      return null;
    }
    case 'assign': {
      const v = lookup(env, s.name); if (!v) throw new PineError(`«${s.name}» no está declarada (usa «${s.name} = …» primero)`, s.line);
      let val = ev(s.e, env);
      if (s.op !== ':=') val = binop(s.op[0], v.cur, val, s.line);
      v.cur = val; return val;
    }
    case 'if': {
      if (truthy(ev(s.cond, env))) return execBlock(s.then, sub(env));
      if (s.els) return execBlock(s.els, sub(env));
      return null;
    }
    case 'for': {
      const from = ev(s.from, env), to = ev(s.to, env); let step = s.by ? ev(s.by, env) : (from <= to ? 1 : -1);
      if (isna(from) || isna(to) || isna(step)) return null; // límite na: el bucle no se ejecuta
      if (step === 0) throw new PineError('El paso del «for» no puede ser 0', s.line);
      const lv = env.frame.slot(s, false); let val = null;
      for (let i = from; step > 0 ? i <= to : i >= to; i += step) {
        tick(ctx, s.line); lv.cur = i; const e2 = sub(env); e2.scope.m.set(s.v, lv);
        val = execBlock(s.body, e2); if (loopCtl(ctx)) break;
      }
      return val;
    }
    case 'forin': {
      let arr = ev(s.iter, env), keys = null;
      if (arr && arr._kind === 'matrix') arr = arr.d.map(r => r.slice()); // matrix: recorre sus filas
      else if (arr && arr._kind === 'map') { keys = [...arr.m.keys()]; arr = [...arr.m.values()]; } // map: [clave, valor]
      else if (isna(arr)) arr = []; // array na: el bucle no corre
      if (!Array.isArray(arr)) throw new PineError('«for … in» necesita un array', s.line);
      const lv = env.frame.slot(s, false); let val = null;
      if (!s.ik) s.ik = {};
      const iv2 = env.frame.slot(s.ik, false);
      for (let i = 0; i < arr.length; i++) {
        tick(ctx, s.line); lv.cur = arr[i]; const e2 = sub(env); e2.scope.m.set(s.v, lv);
        if (s.idx) { iv2.cur = keys ? keys[i] : i; e2.scope.m.set(s.idx, iv2); }
        val = execBlock(s.body, e2); if (loopCtl(ctx)) break;
      }
      return val;
    }
    case 'while': {
      let val = null;
      while (truthy(ev(s.cond, env))) { tick(ctx, s.line); val = execBlock(s.body, sub(env)); if (loopCtl(ctx)) break; }
      return val;
    }
    case 'switch': {
      const subj = s.subject ? ev(s.subject, env) : null; let dflt = null;
      for (const c of s.cases) {
        if (!c.test) { dflt = c; continue; }
        const t = ev(c.test, env);
        if (s.subject ? (!isna(subj) && !isna(t) && (subj instanceof Col ? binop('==', subj, t) : subj === t)) : truthy(t)) return execBlock(c.body, sub(env));
      }
      return dflt ? execBlock(dflt.body, sub(env)) : null;
    }
    case 'fassign': {
      const o = ev(s.target.obj, env);
      if (o && o._kind === 'point' && PT_F[s.target.prop]) { const k = PT_F[s.target.prop]; let val = ev(s.e, env); if (s.op !== ':=') val = binop(s.op[0], o[k], val, s.line); o[k] = isna(val) ? null : val; return val; }
      if (!o || typeof o !== 'object' || !o._t) throw new PineError(`No se puede asignar el campo «${s.target.prop}» (el objeto es na o no es un tipo definido)`, s.line);
      let val = ev(s.e, env); if (s.op !== ':=') val = binop(s.op[0], o[s.target.prop] === undefined ? null : o[s.target.prop], val, s.line);
      o[s.target.prop] = val; return val;
    }
    case 'type': return null;
    case 'enum': return null;
    case 'break': ctx.ctrl = 'break'; return null;
    case 'continue': ctx.ctrl = 'continue'; return null;
    case 'fn': return null; // ya registrada (hoisting)
    case 'import': return null; // ya registrada en analyze()
  }
  throw new PineError('Sentencia no soportada: ' + s.k, s.line);
}

function callUser(fnNode, call, env, recv) {
  const ctx = env.ctx;
  let fr = ctx.frames.get(call); if (!fr) { fr = new Frame(); ctx.frames.set(call, fr); ctx.frameList.push(fr); }
  if (++ctx.depth > 64) throw new PineError('Recursión no permitida en Pine', call.line);
  const scope = {m: new Map(), up: ctx.globalScope}, argv = []; let pos = 0;
  if (recv !== undefined) argv[pos++] = recv;
  for (const a of call.args) {
    const val = ev(a.e, env);
    if (a.name) { const ix = fnNode.params.findIndex(p => p.name === a.name); if (ix < 0) throw new PineError(`Parámetro desconocido «${a.name}» en ${fnNode.name}()`, call.line); argv[ix] = val; }
    else argv[pos++] = val;
  }
  const inner = {ctx, scope, frame: fr};
  fnNode.params.forEach((p, i) => {
    let val = argv[i]; if (val === undefined) val = p.def ? ev(p.def, inner) : null;
    const v = fr.slot(p, false); v.cur = val; scope.m.set(p.name, v);
  });
  const r = execBlock(fnNode.body, inner); ctx.ctrl = null; ctx.depth--; return r;
}
const B = Object.create(null);
const def = (name, sig, f, opt) => { B[name] = Object.assign({sig, f}, opt || {}); };
const PARAM_ALIAS = {plot1: 'hline1', plot2: 'hline2', series: 'series'}; // fill(plot1=…, plot2=…) usa los mismos huecos que hline1/hline2
function callBuiltin(b, name, n, env, recv) {
  const ctx = env.ctx, sig = b.sig, vals = []; let pos = 0, transp;
  if (recv !== undefined) vals[pos++] = recv;
  for (const a of n.args) {
    const v = ev(a.e, env);
    if (a.name === 'transp' && !name.startsWith('color.')) { transp = v; continue; } // sintaxis antigua: transp=NN en plot/fill/bgcolor/…
    if (a.name) {
      let ix = sig ? sig.indexOf(a.name) : -1; if (ix < 0 && sig && PARAM_ALIAS[a.name]) ix = sig.indexOf(PARAM_ALIAS[a.name]);
      if (ix < 0) { if (!b.lenient) warn(ctx, n.line, `El parámetro «${a.name}» de ${name}() no está soportado; se ignora`, name + ':' + a.name); continue; }
      vals[ix] = v;
    } else vals[pos++] = v;
  }
  if (transp !== undefined && !isna(transp) && sig) { sig.forEach((nm, i) => { if ((nm === 'color' || nm === 'textcolor' || nm === 'bgcolor') && vals[i] instanceof Col) vals[i] = new Col(vals[i].r, vals[i].g, vals[i].b, clamp(transp, 0, 100)); }); warn(ctx, n.line, 'transp=… (sintaxis antigua) → color.new(color, transp)', 'fixt', 'fix'); }
  const meta = sig && name.startsWith('input') ? {group: vals[sig.indexOf('group')], inline: vals[sig.indexOf('inline')], tooltip: vals[sig.indexOf('tooltip')], confirm: vals[sig.indexOf('confirm')]} : null;
  return b.f(vals, {ctx, env, node: n, st: env.frame.state(n), line: n.line, name, meta});
}
function evCall(n, env) {
  const ctx = env.ctx, f = n.fn; let parts = null;
  if (f.k === 'id') parts = f._dp || (f._dp = [f.name]); else if (f.k === 'mem') parts = dotted(f);
  if (parts && (parts.length === 1 || !lookup(env, parts[0]))) { // una variable puede llamarse igual que una función (p. ej. «color barcolor = …» y «barcolor(…)»)
    const name = n._nm || (n._nm = parts.join('.'));
    if (ctx.fns.has(name) && (parts.length === 1 || (ctx.libs && ctx.libs.has(parts[0])))) return callUser(ctx.fns.get(name), n, env);
    if (parts.length >= 2 && ctx.libs && ctx.libs.has(parts[0]) && !B[name] && !(parts[0] === 'ta' && B['ta.' + parts.slice(1).join('.')])) { warn(ctx, n.line, `${name}() es de la biblioteca «${ctx.libs.get(parts[0])}», que no está incluida: devuelve na`, 'libf:' + name, 'unsupported'); ctx.incomplete = true; return null; }
    if (parts.length === 1 && ctx.methods.has(name) && n.args.length) { // método llamado como función: el primer argumento es el receptor
      const recv = ev(n.args[0].e, env), ty = typeOfVal(recv), ms = ctx.methods.get(name);
      const m = ms.find(x => x.params[0] && x.params[0].type === ty) || ms.find(x => ty === 'int' && x.params[0] && x.params[0].type === 'float') || ms.find(x => x.params[0] && (!x.params[0].type || x.params[0].type === 'series')) || ms[0];
      return callUser(m, Object.assign({}, n, {args: n.args.slice(1)}), env, recv);
    }
    if (parts.length === 2 && parts[1] === 'new' && ctx.types.has(parts[0])) return newObj(ctx.types.get(parts[0]), n, env);
    if (name === 'request.security_lower_tf') return evSecurityLTF(n, env);
    if (name === 'request.security' || (name === 'security' && parts.length === 1 && !ctx.fns.has('security'))) { if (name === 'security') (ctx.legacyUsed || (ctx.legacyUsed = new Map())).set('security', 'request.security'); return evSecurity(n, env); }
    let b = B[name]; if (!b && /^array\.new[a-z]/.test(name) && B[name.replace(/^array\.new/, 'array.new_')]) b = B[name.replace(/^array\.new/, 'array.new_')]; /* v4: array.newcolor… */ if (!b && name.startsWith('array.new_')) b = B['array.new'];
    if (!b && parts.length === 1) b = B['math.' + name] || B['ta.' + name] || B['str.' + name] || B[LEGACY[name]]; // v4: max()/min() son math.max/min
    if (b) return callBuiltin(b, name, n, env);
    if (parts[0] === 'strategy') { warn(ctx, n.line, 'Las órdenes de «strategy.*» se ignoran: este script solo se muestra como indicador (el backtesting llega en la Fase 7)', 'strategy', 'unsupported'); ctx.incomplete = true; return null; }
    warn(ctx, n.line, `Función no soportada: ${name}() — devuelve na`, 'f:' + name, 'unsupported'); ctx.incomplete = true; return null;
  }
  if (f.k === 'mem') {
    const recv = ev(f.obj, env);
    const ms = ctx.methods.get(f.prop);
    const ns0 = Array.isArray(recv) ? 'array' : recv && recv._kind ? (recv._kind === 'point' ? 'chart.point' : recv._kind) : typeof recv === 'string' ? 'str' : null;
    if (ms) { const ty = typeOfVal(recv), pt = x => x.params[0] && x.params[0].type;
      const m = ms.find(x => pt(x) === ty) || ms.find(x => ty === 'int' && pt(x) === 'float') || ms.find(x => x.params[0] && (!pt(x) || pt(x) === 'series'))
        || (typeof recv === 'string' ? ms.find(x => ctx.enums && ctx.enums.has(pt(x))) : null) // valor de un enum propio
        || (!(ns0 && B[ns0 + '.' + f.prop]) && ms.find(x => x.params[0]) ) || null; // receptor na o de otro tipo: el método propio con ese nombre
      if (m) return callUser(m, n, env, recv); }
    if (recv && recv._t && f.prop === 'copy') return Object.assign({}, recv);
    const ns = ns0;
    const b = ns && B[ns + '.' + f.prop];
    if (b) return callBuiltin(b, ns + '.' + f.prop, n, env, recv);
    if (isna(recv)) { // método de un objeto que todavía es na (line/label/box…): como line.get_y1(na) → na, line.set_x2(na, …) → no hace nada
      const nsn = ['line', 'label', 'box', 'table', 'linefill', 'polyline', 'array', 'matrix', 'map', 'chart.point'].find(q => B[q + '.' + f.prop]);
      if (nsn) { try { return callBuiltin(B[nsn + '.' + f.prop], nsn + '.' + f.prop, n, env, recv); } catch (e) { if (!e.pine) throw e; return null; } }
    }
    { const dp = dotted(f), nm = dp && dp.join('.'); if (nm && B[nm]) return callBuiltin(B[nm], nm, n, env); if (dp && dp.length === 2 && dp[1] === 'new' && ctx.types.has(dp[0])) return newObj(ctx.types.get(dp[0]), n, env); } // la variable tapaba un espacio de nombres (color.new con un parámetro «color»)
    if (isna(recv)) { warn(ctx, n.line, `.${f.prop}() sobre un valor na: devuelve na`, 'nam:' + f.prop, 'unsupported'); ctx.incomplete = true; return null; } // objeto de una biblioteca no incluida o aún sin crear
    throw new PineError(`El método «${f.prop}» no está soportado para este valor`, n.line);
  }
  throw new PineError(`«${f.name || 'expresión'}» no es una función`, n.line);
}
const PT_F = {index: 'i', time: 't', price: 'p'};
const typeOfVal = v => Array.isArray(v) ? 'array' : v && v._t ? v._t : v && v._kind ? v._kind : typeof v === 'string' ? 'string' : typeof v === 'number' ? (Number.isInteger(v) ? 'int' : 'float') : typeof v === 'boolean' ? 'bool' : v instanceof Col ? 'color' : null;
function newObj(tn, call, env) {
  const o = {_t: tn.name}, argv = []; let pos = 0;
  for (const a of call.args) { const val = ev(a.e, env); if (a.name) { const ix = tn.fields.findIndex(f => f.name === a.name); if (ix < 0) throw new PineError(`El tipo ${tn.name} no tiene el campo «${a.name}»`, call.line); argv[ix] = val; } else argv[pos++] = val; }
  tn.fields.forEach((f, i) => { o[f.name] = argv[i] !== undefined ? argv[i] : (f.def ? ev(f.def, env) : null); });
  return o;
}
const LEGACY = Object.assign(Object.create(null), {study: 'indicator', security: 'request.security', tostring: 'str.tostring', tonumber: 'str.tonumber', iff: 'iff', input: 'input', na: 'na', nz: 'nz', fixnan: 'fixnan'});

/* ───────────── Motor de series (ta.*) ─────────────
   Cada llamada del script tiene su propio estado (por nodo y por llamada de función), como en Pine. */
const LEN = x => isna(x) ? 1 : Math.max(1, Math.round(x));
function pushV(s, bar, v) { if (!s.b) { s.b = []; s.pb = -1; } if (s.pb === bar) s.b[s.b.length - 1] = v; else { s.b.push(v); s.pb = bar; } return s.b; }
function sma(s, bar, v, len) {
  const b = pushV(s, bar, v); if (b.length < len) return null;
  let t = 0; for (let i = b.length - len; i < b.length; i++) { const x = b[i]; if (isna(x)) return null; t += x; }
  return t / len;
}
function ema(s, bar, v, len) {
  if (s.eb !== bar) { s.ep = s.eo; s.eb = bar; }
  const a = 2 / (len + 1); let o;
  if (isna(v)) o = null; else o = isna(s.ep) ? v : a * v + (1 - a) * s.ep;
  s.eo = o; return o;
}
function rma(s, bar, v, len) {
  if (s.rb !== bar) { s.rp = s.ro; s.rb = bar; }
  if (!s.m) s.m = {};
  const m = sma(s.m, bar, v, len); let o;
  if (isna(s.rp)) o = m; else o = isna(v) ? null : (v + (len - 1) * s.rp) / len;
  s.ro = o; return o;
}
function wma(s, bar, v, len) {
  const b = pushV(s, bar, v); if (b.length < len) return null;
  let t = 0; for (let i = 0; i < len; i++) { const x = b[b.length - len + i]; if (isna(x)) return null; t += x * (i + 1); }
  return t / (len * (len + 1) / 2);
}
function hhll(s, bar, v, len, hi) {
  const b = pushV(s, bar, v); if (b.length < len) return null; let r = null;
  for (let i = b.length - len; i < b.length; i++) { const x = b[i]; if (isna(x)) continue; if (r === null || (hi ? x > r : x < r)) r = x; }
  return r;
}
function hhllBars(s, bar, v, len, hi) {
  const b = pushV(s, bar, v); if (b.length < len) return null; let r = null, at = -1;
  for (let i = b.length - len; i < b.length; i++) { const x = b[i]; if (isna(x)) continue; if (r === null || (hi ? x >= r : x <= r)) { r = x; at = i; } }
  return at < 0 ? null : at - (b.length - 1);
}
function sumw(s, bar, v, len) { const b = pushV(s, bar, v); if (b.length < len) return null; let t = 0; for (let i = b.length - len; i < b.length; i++) { if (isna(b[i])) return null; t += b[i]; } return t; }
function varianceE(s, bar, v, len, biased) {
  const b = pushV(s, bar, v); if (b.length < len) return null; let t = 0;
  for (let i = b.length - len; i < b.length; i++) { if (isna(b[i])) return null; t += b[i]; }
  const mu = t / len; let q = 0; for (let i = b.length - len; i < b.length; i++) q += (b[i] - mu) ** 2;
  return q / (biased ? len : len - 1);
}
function changeE(s, bar, v, len) { const b = pushV(s, bar, v); if (b.length <= len) return null; const p = b[b.length - 1 - len]; return isna(v) || isna(p) ? null : v - p; }
function trV(ctx, bar, handle) {
  const c = ctx.candles[bar], p = bar > 0 ? ctx.candles[bar - 1] : null;
  if (!p) return handle ? c.h - c.l : null;
  return Math.max(c.h - c.l, Math.abs(c.h - p.c), Math.abs(c.l - p.c));
}
function atrE(s, ctx, len) { if (!s.t) s.t = {}; return rma(s.t, ctx.bar, trV(ctx, ctx.bar, true), len); }
function crossState(s, bar, a, b) { if (s.bar !== bar) { s.pa = s.ca; s.pb = s.cb; s.bar = bar; } s.ca = a; s.cb = b; return !(isna(a) || isna(b) || isna(s.pa) || isna(s.pb)); }
const sub1 = (s, k) => s[k] || (s[k] = {});
function rsiE(s, bar, v, len) {
  const ch = changeE(sub1(s, 'c'), bar, v, 1);
  const up = isna(ch) ? null : Math.max(ch, 0), dn = isna(ch) ? null : -Math.min(ch, 0);
  const u = rma(sub1(s, 'u'), bar, up, len), d = rma(sub1(s, 'd'), bar, dn, len);
  if (isna(u) || isna(d)) return null; return d === 0 ? 100 : u === 0 ? 0 : 100 - 100 / (1 + u / d);
}
function stochE(s, bar, src, hi, lo, len) {
  const hh = hhll(sub1(s, 'h'), bar, hi, len, true), ll = hhll(sub1(s, 'l'), bar, lo, len, false);
  if (isna(hh) || isna(ll) || isna(src) || hh === ll) return null; return 100 * (src - ll) / (hh - ll);
}
function pivotE(s, bar, src, left, right, isHigh) {
  const b = pushV(s, bar, src), k = b.length - 1 - right; if (k - left < 0) return null;
  const c = b[k]; if (isna(c)) return null;
  for (let i = k - left; i <= k + right; i++) { const x = b[i]; if (isna(x)) return null; if (isHigh ? x > c : x < c) return null; }
  return c;
}
function superE(s, ctx, factor, len) {
  const bar = ctx.bar, c = ctx.candles[bar], src = (c.h + c.l) / 2, atr = atrE(sub1(s, 'a'), ctx, len);
  if (s.bar !== bar) { s.pu = s.u; s.pl = s.l; s.pd = s.d; s.pst = s.st; s.patr = s.atr; s.bar = bar; }
  s.atr = atr; if (isna(atr)) { s.u = s.l = s.d = s.st = null; return new Tup([null, null]); }
  let upper = src + factor * atr, lower = src - factor * atr;
  const pL = isna(s.pl) ? 0 : s.pl, pU = isna(s.pu) ? 0 : s.pu, pc = bar > 0 ? ctx.candles[bar - 1].c : null;
  lower = (lower > pL || (pc !== null && pc < pL)) ? lower : pL;
  upper = (upper < pU || (pc !== null && pc > pU)) ? upper : pU;
  let dir; if (isna(s.patr)) dir = 1; else if (s.pst === pU) dir = c.c > upper ? -1 : 1; else dir = c.c < lower ? 1 : -1;
  s.u = upper; s.l = lower; s.d = dir; s.st = dir === -1 ? lower : upper;
  return new Tup([s.st, dir]);
}
const na2 = (a, f) => isna(a) ? null : f(a);

/* ta.* */
const S1 = ['source', 'length'];
def('ta.sma', S1, (a, c) => sma(c.st, c.ctx.bar, a[0], LEN(a[1])));
def('ta.ema', S1, (a, c) => ema(c.st, c.ctx.bar, a[0], LEN(a[1])));
def('ta.rma', S1, (a, c) => rma(c.st, c.ctx.bar, a[0], LEN(a[1])));
def('ta.wma', S1, (a, c) => wma(c.st, c.ctx.bar, a[0], LEN(a[1])));
def('ta.swma', ['source'], (a, c) => { const b = pushV(c.st, c.ctx.bar, a[0]); if (b.length < 4) return null; const w = [1, 2, 2, 1], x = b.slice(-4); return x.some(isna) ? null : x.reduce((t, v, i) => t + v * w[i], 0) / 6; });
def('ta.vwma', ['source', 'length'], (a, c) => { const bar = c.ctx.bar, len = LEN(a[1]), vol = c.ctx.candles[bar].v; const n = sma(sub1(c.st, 'n'), bar, isna(a[0]) ? null : a[0] * vol, len), d = sma(sub1(c.st, 'd'), bar, vol, len); return isna(n) || isna(d) || d === 0 ? null : n / d; });
def('ta.hma', S1, (a, c) => { const bar = c.ctx.bar, len = LEN(a[1]); const w1 = wma(sub1(c.st, 'a'), bar, a[0], Math.max(1, Math.floor(len / 2))), w2 = wma(sub1(c.st, 'b'), bar, a[0], len); return wma(sub1(c.st, 'c'), bar, isna(w1) || isna(w2) ? null : 2 * w1 - w2, Math.max(1, Math.round(Math.sqrt(len)))); });
def('ta.rsi', S1, (a, c) => rsiE(c.st, c.ctx.bar, a[0], LEN(a[1])));
def('ta.macd', ['source', 'fastlen', 'slowlen', 'siglen'], (a, c) => {
  const bar = c.ctx.bar, f = ema(sub1(c.st, 'f'), bar, a[0], LEN(a[1])), s = ema(sub1(c.st, 's'), bar, a[0], LEN(a[2]));
  const m = isna(f) || isna(s) ? null : f - s, sg = ema(sub1(c.st, 'g'), bar, m, LEN(a[3]));
  return new Tup([m, sg, isna(m) || isna(sg) ? null : m - sg]);
});
def('ta.stoch', ['source', 'high', 'low', 'length'], (a, c) => stochE(c.st, c.ctx.bar, a[0], a[1], a[2], LEN(a[3])));
def('ta.tr', ['handle_na'], (a, c) => trV(c.ctx, c.ctx.bar, truthy(a[0])));
def('ta.atr', ['length'], (a, c) => atrE(c.st, c.ctx, LEN(a[0])));
def('ta.bb', ['series', 'length', 'mult'], (a, c) => { const bar = c.ctx.bar, len = LEN(a[1]), b = sma(sub1(c.st, 'm'), bar, a[0], len), v = varianceE(sub1(c.st, 'v'), bar, a[0], len, true); if (isna(b) || isna(v)) return new Tup([null, null, null]); const d = a[2] * Math.sqrt(v); return new Tup([b, b + d, b - d]); });
def('ta.bbw', ['series', 'length', 'mult'], (a, c) => { const bar = c.ctx.bar, len = LEN(a[1]), b = sma(sub1(c.st, 'm'), bar, a[0], len), v = varianceE(sub1(c.st, 'v'), bar, a[0], len, true); if (isna(b) || isna(v) || b === 0) return null; return 2 * a[2] * Math.sqrt(v) / b; });
function kcE(c, a, wantW) {
  const bar = c.ctx.bar, len = LEN(a[1]), ma = ema(sub1(c.st, 'e'), bar, a[0], len), tr = a[3] === false ? c.ctx.candles[bar].h - c.ctx.candles[bar].l : trV(c.ctx, bar, false), r = rma(sub1(c.st, 'r'), bar, tr, len);
  if (isna(ma) || isna(r)) return wantW ? null : new Tup([null, null, null]);
  return wantW ? 2 * r * a[2] / ma : new Tup([ma, ma + r * a[2], ma - r * a[2]]);
}
def('ta.kc', ['series', 'length', 'mult', 'useTrueRange'], (a, c) => kcE(c, a, false));
def('ta.kcw', ['series', 'length', 'mult', 'useTrueRange'], (a, c) => kcE(c, a, true));
def('ta.cci', S1, (a, c) => { const bar = c.ctx.bar, len = LEN(a[1]), m = sub1(c.st, 'm'), ma = sma(m, bar, a[0], len); if (isna(ma)) return null; let d = 0; for (let i = m.b.length - len; i < m.b.length; i++) d += Math.abs(m.b[i] - ma); d /= len; return d === 0 ? null : (a[0] - ma) / (0.015 * d); });
def('ta.mfi', S1, (a, c) => {
  const bar = c.ctx.bar, len = LEN(a[1]), vol = c.ctx.candles[bar].v, ch = changeE(sub1(c.st, 'c'), bar, a[0], 1);
  const up = sumw(sub1(c.st, 'u'), bar, isna(ch) ? null : vol * (ch <= 0 ? 0 : a[0]), len), lo = sumw(sub1(c.st, 'l'), bar, isna(ch) ? null : vol * (ch >= 0 ? 0 : a[0]), len);
  return isna(up) || isna(lo) || lo === 0 ? null : 100 - 100 / (1 + up / lo);
});
def('ta.wpr', ['length'], (a, c) => { const bar = c.ctx.bar, len = LEN(a[0]), k = c.ctx.candles[bar], hh = hhll(sub1(c.st, 'h'), bar, k.h, len, true), ll = hhll(sub1(c.st, 'l'), bar, k.l, len, false); return isna(hh) || isna(ll) || hh === ll ? null : 100 * (k.c - hh) / (hh - ll); });
def('ta.change', ['source', 'length'], (a, c) => changeE(c.st, c.ctx.bar, a[0], a[1] === undefined ? 1 : LEN(a[1])));
def('ta.mom', S1, (a, c) => changeE(c.st, c.ctx.bar, a[0], LEN(a[1])));
def('ta.roc', S1, (a, c) => { const b = pushV(c.st, c.ctx.bar, a[0]), len = LEN(a[1]); if (b.length <= len) return null; const p = b[b.length - 1 - len]; return isna(a[0]) || isna(p) || p === 0 ? null : 100 * (a[0] - p) / p; });
def('ta.highest', S1, (a, c) => a[1] === undefined ? hhll(c.st, c.ctx.bar, c.ctx.candles[c.ctx.bar].h, LEN(a[0]), true) : hhll(c.st, c.ctx.bar, a[0], LEN(a[1]), true));
def('ta.lowest', S1, (a, c) => a[1] === undefined ? hhll(c.st, c.ctx.bar, c.ctx.candles[c.ctx.bar].l, LEN(a[0]), false) : hhll(c.st, c.ctx.bar, a[0], LEN(a[1]), false));
def('ta.highestbars', S1, (a, c) => a[1] === undefined ? hhllBars(c.st, c.ctx.bar, c.ctx.candles[c.ctx.bar].h, LEN(a[0]), true) : hhllBars(c.st, c.ctx.bar, a[0], LEN(a[1]), true));
def('ta.lowestbars', S1, (a, c) => a[1] === undefined ? hhllBars(c.st, c.ctx.bar, c.ctx.candles[c.ctx.bar].l, LEN(a[0]), false) : hhllBars(c.st, c.ctx.bar, a[0], LEN(a[1]), false));
def('ta.crossover', ['source1', 'source2'], (a, c) => crossState(c.st, c.ctx.bar, a[0], a[1]) && a[0] > a[1] && c.st.pa <= c.st.pb);
def('ta.crossunder', ['source1', 'source2'], (a, c) => crossState(c.st, c.ctx.bar, a[0], a[1]) && a[0] < a[1] && c.st.pa >= c.st.pb);
def('ta.cross', ['source1', 'source2'], (a, c) => crossState(c.st, c.ctx.bar, a[0], a[1]) && ((a[0] > a[1] && c.st.pa <= c.st.pb) || (a[0] < a[1] && c.st.pa >= c.st.pb)));
const pivArgs = a => a.length >= 3 || a[2] !== undefined ? [a[0], a[1], a[2]] : [null, a[0], a[1]];
def('ta.pivothigh', ['source', 'leftbars', 'rightbars'], (a, c) => { const [s, l, r] = pivArgs(a); return pivotE(c.st, c.ctx.bar, s === null ? c.ctx.candles[c.ctx.bar].h : s, LEN(l), LEN(r), true); });
def('ta.pivotlow', ['source', 'leftbars', 'rightbars'], (a, c) => { const [s, l, r] = pivArgs(a); return pivotE(c.st, c.ctx.bar, s === null ? c.ctx.candles[c.ctx.bar].l : s, LEN(l), LEN(r), false); });
def('ta.barssince', ['condition'], (a, c) => { const s = c.st; if (s.bar !== c.ctx.bar) { s.p = s.o; s.bar = c.ctx.bar; } s.o = truthy(a[0]) ? 0 : (isna(s.p) ? null : s.p + 1); return s.o; });
def('ta.valuewhen', ['condition', 'source', 'occurrence'], (a, c) => { const s = c.st; if (!s.l) s.l = []; if (s.bar !== c.ctx.bar) { s.bar = c.ctx.bar; if (truthy(a[0])) { s.l.unshift(a[1]); if (s.l.length > 500) s.l.pop(); } } const v = s.l[a[2] || 0]; return v === undefined ? null : v; });
def('ta.cum', ['source'], (a, c) => { const s = c.st; if (s.bar !== c.ctx.bar) { s.p = s.o || 0; s.bar = c.ctx.bar; } s.o = s.p + (isna(a[0]) ? 0 : a[0]); return s.o; });
def('ta.stdev', ['source', 'length', 'biased'], (a, c) => { const v = varianceE(c.st, c.ctx.bar, a[0], LEN(a[1]), a[2] !== false); return isna(v) ? null : Math.sqrt(v); });
def('ta.variance', ['source', 'length', 'biased'], (a, c) => varianceE(c.st, c.ctx.bar, a[0], LEN(a[1]), a[2] !== false));
def('ta.dev', S1, (a, c) => { const len = LEN(a[1]), ma = sma(c.st, c.ctx.bar, a[0], len); if (isna(ma)) return null; let d = 0; for (let i = c.st.b.length - len; i < c.st.b.length; i++) d += Math.abs(c.st.b[i] - ma); return d / len; });
const winOf = (c, a, len) => { const b = pushV(c.st, c.ctx.bar, a), w = b.length >= len ? b.slice(-len) : null; return w && !w.some(isna) ? w : null; };
def('ta.range', S1, (a, c) => { const w = winOf(c, a[0], LEN(a[1])); return w ? Math.max(...w) - Math.min(...w) : null; });
def('ta.max', ['source'], (a, c) => { const s = c.st; if (s.pb !== c.ctx.bar) { s.prevMax = s.mx; s.pb = c.ctx.bar; } if (!isna(a[0])) s.mx = isna(s.prevMax) ? a[0] : Math.max(s.prevMax, a[0]); return isna(s.mx) ? null : s.mx; });
def('ta.min', ['source'], (a, c) => { const s = c.st; if (s.pb !== c.ctx.bar) { s.prevMin = s.mn; s.pb = c.ctx.bar; } if (!isna(a[0])) s.mn = isna(s.prevMin) ? a[0] : Math.min(s.prevMin, a[0]); return isna(s.mn) ? null : s.mn; });
def('ta.mode', S1, (a, c) => { const w = winOf(c, a[0], LEN(a[1])); if (!w) return null; const cnt = new Map(); for (const v of w) cnt.set(v, (cnt.get(v) || 0) + 1); let best = null, bc = 0; for (const [v, k] of cnt) if (k > bc || (k === bc && v < best)) { best = v; bc = k; } return best; });
def('ta.percentile_linear_interpolation', ['source', 'length', 'percentage'], (a, c) => { const w = winOf(c, a[0], LEN(a[1])); if (!w) return null; w.sort((x, y) => x - y); const k = (a[2] / 100) * (w.length - 1), f = Math.floor(k), t = Math.ceil(k); return w[f] + (w[t] - w[f]) * (k - f); });
def('ta.percentile_nearest_rank', ['source', 'length', 'percentage'], (a, c) => { const w = winOf(c, a[0], LEN(a[1])); if (!w) return null; w.sort((x, y) => x - y); return w[Math.min(w.length - 1, Math.max(0, Math.ceil(a[2] / 100 * w.length) - 1))]; });
def('ta.cmo', S1, (a, c) => { const len = LEN(a[1]), w = winOf(c, a[0], len + 1); if (!w) return null; let up = 0, dn = 0; for (let i = 1; i < w.length; i++) { const d = w[i] - w[i - 1]; if (d > 0) up += d; else dn -= d; } return up + dn === 0 ? 0 : 100 * (up - dn) / (up + dn); });
def('ta.cog', S1, (a, c) => { const len = LEN(a[1]), w = winOf(c, a[0], len); if (!w) return null; let num = 0, den = 0; for (let i = 0; i < len; i++) { const v = w[len - 1 - i]; num += v * (i + 1); den += v; } return den === 0 ? null : -num / den; });
def('ta.alma', ['series', 'length', 'offset', 'sigma', 'floor'], (a, c) => { const len = LEN(a[1]), w = winOf(c, a[0], len); if (!w) return null; const off = a[2] === undefined ? 0.85 : a[2], sg = a[3] === undefined ? 6 : a[3], m = Math.floor(off * (len - 1)), sd = len / sg; let num = 0, den = 0; for (let i = 0; i < len; i++) { const k = Math.exp(-((i - m) ** 2) / (2 * sd * sd)); num += k * w[i]; den += k; } return num / den; });
def('ta.correlation', ['source1', 'source2', 'length'], (a, c) => { const len = LEN(a[2]), x = winOf({st: sub1(c.st, 'x'), ctx: c.ctx}, a[0], len), y = winOf({st: sub1(c.st, 'y'), ctx: c.ctx}, a[1], len); if (!x || !y) return null; const mx = x.reduce((p, q) => p + q, 0) / len, my = y.reduce((p, q) => p + q, 0) / len; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < len; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; } return sxx === 0 || syy === 0 ? null : sxy / Math.sqrt(sxx * syy); });
def('ta.tsi', ['source', 'short_length', 'long_length'], (a, c) => { const bar = c.ctx.bar, b = pushV(sub1(c.st, 'src'), bar, a[0]), ch = b.length > 1 && !isna(a[0]) && !isna(b[b.length - 2]) ? a[0] - b[b.length - 2] : null, sl = LEN(a[1]), ll = LEN(a[2]);
  const n = ema(sub1(c.st, 'e2'), bar, ema(sub1(c.st, 'e1'), bar, ch, ll), sl), d = ema(sub1(c.st, 'f2'), bar, ema(sub1(c.st, 'f1'), bar, ch === null ? null : Math.abs(ch), ll), sl); return isna(n) || isna(d) || d === 0 ? null : 100 * n / d; });
def('ta.sar', ['start', 'inc', 'max'], (a, c) => {
  const ctx = c.ctx, bar = ctx.bar, k = ctx.candles[bar], s = c.st, st = a[0] === undefined ? 0.02 : a[0], inc = a[1] === undefined ? 0.02 : a[1], mx = a[2] === undefined ? 0.2 : a[2];
  if (s.bar !== bar) { s.prev = s.cur ? Object.assign({}, s.cur) : null; s.bar = bar; }
  const p = s.prev, pk = bar > 0 ? ctx.candles[bar - 1] : null; let cur;
  if (!p) { if (!pk) { s.cur = null; return null; } const long = k.c >= pk.c; cur = {sar: long ? pk.l : pk.h, ep: long ? k.h : k.l, af: st, long}; }
  else {
    let sar = p.sar + p.af * (p.ep - p.sar), long = p.long, ep = p.ep, af = p.af;
    const p2 = bar > 1 ? ctx.candles[bar - 2] : pk;
    if (long) { sar = Math.min(sar, pk.l, p2.l); if (k.l < sar) { long = false; sar = ep; ep = k.l; af = st; } else if (k.h > ep) { ep = k.h; af = Math.min(mx, af + inc); } }
    else { sar = Math.max(sar, pk.h, p2.h); if (k.h > sar) { long = true; sar = ep; ep = k.h; af = st; } else if (k.l < ep) { ep = k.l; af = Math.min(mx, af + inc); } }
    cur = {sar, ep, af, long};
  }
  s.cur = cur; return cur.sar;
});
def('ta.median', S1, (a, c) => { const len = LEN(a[1]), b = pushV(c.st, c.ctx.bar, a[0]); if (b.length < len) return null; const w = b.slice(-len); if (w.some(isna)) return null; w.sort((x, y) => x - y); return len % 2 ? w[(len - 1) / 2] : (w[len / 2 - 1] + w[len / 2]) / 2; });
def('ta.linreg', ['source', 'length', 'offset'], (a, c) => {
  const len = LEN(a[1]), b = pushV(c.st, c.ctx.bar, a[0]); if (b.length < len) return null; const w = b.slice(-len); if (w.some(isna)) return null;
  let sx = 0, sy = 0, sxy = 0, sxx = 0; for (let i = 0; i < len; i++) { sx += i; sy += w[i]; sxy += i * w[i]; sxx += i * i; }
  const den = len * sxx - sx * sx, slope = den === 0 ? 0 : (len * sxy - sx * sy) / den, icpt = (sy - slope * sx) / len;
  return icpt + slope * (len - 1 - (a[2] || 0));
});
def('ta.rising', S1, (a, c) => { const len = LEN(a[1]), b = pushV(c.st, c.ctx.bar, a[0]); if (b.length <= len) return false; for (let i = 0; i < len; i++) { const x = b[b.length - 1 - i], y = b[b.length - 2 - i]; if (isna(x) || isna(y) || !(x > y)) return false; } return true; });
def('ta.falling', S1, (a, c) => { const len = LEN(a[1]), b = pushV(c.st, c.ctx.bar, a[0]); if (b.length <= len) return false; for (let i = 0; i < len; i++) { const x = b[b.length - 1 - i], y = b[b.length - 2 - i]; if (isna(x) || isna(y) || !(x < y)) return false; } return true; });
def('ta.percentrank', S1, (a, c) => { const len = LEN(a[1]), b = pushV(c.st, c.ctx.bar, a[0]); if (b.length <= len) return null; let k = 0; for (let i = b.length - 1 - len; i < b.length - 1; i++) if (b[i] <= a[0]) k++; return 100 * k / len; });
def('ta.supertrend', ['factor', 'atrPeriod'], (a, c) => superE(c.st, c.ctx, a[0], LEN(a[1])));
def('ta.dmi', ['diLength', 'adxSmoothing'], (a, c) => {
  const bar = c.ctx.bar, ctx = c.ctx, len = LEN(a[0]), k = ctx.candles[bar], p = bar > 0 ? ctx.candles[bar - 1] : null;
  const up = p ? k.h - p.h : null, dn = p ? p.l - k.l : null;
  const pdm = p ? (up > dn && up > 0 ? up : 0) : null, mdm = p ? (dn > up && dn > 0 ? dn : 0) : null;
  const tr = rma(sub1(c.st, 't'), bar, trV(ctx, bar, false), len), pp = rma(sub1(c.st, 'p'), bar, pdm, len), mm = rma(sub1(c.st, 'm'), bar, mdm, len);
  const plus = isna(tr) || isna(pp) || tr === 0 ? null : 100 * pp / tr, minus = isna(tr) || isna(mm) || tr === 0 ? null : 100 * mm / tr;
  const sum = isna(plus) || isna(minus) ? null : plus + minus;
  const adx = rma(sub1(c.st, 'x'), bar, sum === null ? null : 100 * Math.abs(plus - minus) / (sum === 0 ? 1 : sum), LEN(a[1]));
  return new Tup([plus, minus, adx]);
});
/* ta.adx(len, suavizado): atajo que los modelos de IA escriben muy seguido (en Pine real se saca de ta.dmi). Devuelve el ADX de ta.dmi con los mismos cálculos. */
def('ta.adx', ['diLength', 'adxSmoothing'], (a, c) => { const t = B['ta.dmi'].f([a[0], a[1] === undefined || isna(a[1]) ? a[0] : a[1]], c); return t.a[2]; });
CONST_DYN['ta.tr'] = (ctx) => trV(ctx, ctx.bar, false);
CONST_DYN['ta.vwap'] = (ctx, st) => { const c = ctx.candles[ctx.bar]; if (st.bar !== ctx.bar) { const d = Math.floor(c.t / 864e5); if (d !== st.day) { st.day = d; st.pv = 0; st.v = 0; } st.pv += (c.h + c.l + c.c) / 3 * c.v; st.v += c.v; st.bar = ctx.bar; } return st.v ? st.pv / st.v : null; };
// variables acumuladas de ta.* (también las de v4 sin prefijo: accdist, pvt, nvi…)
const accV = (ctx, st, f) => { if (st.bar !== ctx.bar) { const c = ctx.candles[ctx.bar], p = ctx.candles[ctx.bar - 1]; st.v = f(c, p, st.v); st.bar = ctx.bar; } return st.v; };
CONST_DYN['ta.accdist'] = (ctx, st) => accV(ctx, st, (c, p, a) => (a || 0) + (c.h === c.l ? 0 : ((c.c - c.l) - (c.h - c.c)) / (c.h - c.l) * c.v));
CONST_DYN['ta.pvt'] = (ctx, st) => accV(ctx, st, (c, p, a) => (a || 0) + (p && p.c ? (c.c - p.c) / p.c * c.v : 0));
CONST_DYN['ta.nvi'] = (ctx, st) => accV(ctx, st, (c, p, a) => a == null ? 1 : (p && c.v < p.v && p.c ? a + (c.c - p.c) / p.c * a : a));
CONST_DYN['ta.pvi'] = (ctx, st) => accV(ctx, st, (c, p, a) => a == null ? 1 : (p && c.v > p.v && p.c ? a + (c.c - p.c) / p.c * a : a));
CONST_DYN['ta.wad'] = (ctx, st) => accV(ctx, st, (c, p, a) => (a || 0) + (!p ? 0 : c.c > p.c ? c.c - Math.min(c.l, p.c) : c.c < p.c ? c.c - Math.max(c.h, p.c) : 0));
CONST_DYN['ta.wvad'] = (ctx) => { const c = ctx.candles[ctx.bar]; return c.h === c.l ? null : (c.c - c.o) / (c.h - c.l) * c.v; };
CONST_DYN['ta.iii'] = (ctx) => { const c = ctx.candles[ctx.bar]; return c.h === c.l || !c.v ? null : (2 * c.c - c.h - c.l) / ((c.h - c.l) * c.v); };
CONST_DYN['ta.obv'] = (ctx, st) => { if (st.bar !== ctx.bar) { const c = ctx.candles[ctx.bar], p = ctx.candles[ctx.bar - 1], ch = p ? c.c - p.c : 0; st.o = (st.o || 0) + (ch > 0 ? c.v : ch < 0 ? -c.v : 0); st.bar = ctx.bar; } return st.o; };
def('ta.vwap', ['source', 'anchor', 'stdev_mult'], (a, c) => { // ta.vwap(src) · ta.vwap(src, anchor) · ta.vwap(src, anchor, mult) → [vwap, banda superior, banda inferior]
  const ctx = c.ctx, k = ctx.candles[ctx.bar], s = c.st;
  if (s.bar !== ctx.bar) {
    const reset = a[1] === undefined ? Math.floor(k.t / 864e5) !== s.day : !!a[1] && !isna(a[1]); s.day = Math.floor(k.t / 864e5);
    if (reset || s.v === undefined) { s.pv = 0; s.v = 0; s.pv2 = 0; }
    if (!isna(a[0])) { s.pv += a[0] * k.v; s.v += k.v; s.pv2 += a[0] * a[0] * k.v; } s.bar = ctx.bar;
  }
  const vw = s.v ? s.pv / s.v : null;
  if (a[2] === undefined) return vw;
  const sd = s.v ? Math.sqrt(Math.max(0, s.pv2 / s.v - vw * vw)) : null, m = isna(a[2]) ? 1 : a[2];
  return new Tup([vw, vw === null ? null : vw + sd * m, vw === null ? null : vw - sd * m]);
});

/* Generales */
def('na', ['x'], a => isna(a[0]));
def('nz', ['source', 'replacement'], a => isna(a[0]) ? (a[1] === undefined ? 0 : a[1]) : a[0]);
def('fixnan', ['source'], (a, c) => { if (!isna(a[0])) c.st.last = a[0]; return isna(a[0]) ? (c.st.last === undefined ? null : c.st.last) : a[0]; });
def('iff', ['cond', 'then', 'else'], a => truthy(a[0]) ? a[1] : a[2]);
for (const nm of ['max_bars_back', 'log.info', 'log.warning', 'log.error', 'runtime.error']) def(nm, null, (a, c) => { if (nm === 'runtime.error') { const e = new PineError(String(a[0]), c.line); e.fatal = true; throw e; } warn(c.ctx, c.line, `${nm}() se ignora`, 'ign:' + nm, 'info'); return null; }, {lenient: true});
// Alertas: se registran por llamada (call-site) y la app las evalúa en la última vela cerrada (sin repintado)
const alertSlot = (c, kind, title) => { const o = c.ctx.out; o.alerts = o.alerts || []; let s = c.st.al; if (!s) { s = c.st.al = {kind, title: title, message: '', bars: [], msgs: {}}; o.alerts.push(s); } return s; };
const noteAlert = (s, c, msg) => { s.bars.push(c.ctx.bar); if (s.bars.length > ((c.ctx.opts && c.ctx.opts.alertCap) || 400)) s.bars.shift(); if (msg !== undefined && msg !== null) { s.message = String(msg); s.msgs[c.ctx.bar] = s.message; const ks = Object.keys(s.msgs); if (ks.length > 8) delete s.msgs[ks[0]]; } };
def('alertcondition', ['condition', 'title', 'message'], (a, c) => { const s = alertSlot(c, 'cond', a[1] === undefined || a[1] === null ? 'Condición ' + (c.ctx.out.alerts ? c.ctx.out.alerts.length + 1 : 1) : String(a[1])); if (a[2] !== undefined && a[2] !== null) s.message = String(a[2]); if (truthy(a[0])) noteAlert(s, c, a[2]); return null; }, {lenient: true});
def('alert', ['message', 'freq'], (a, c) => { const s = alertSlot(c, 'call', 'alert()'); noteAlert(s, c, a[0]); return null; }, {lenient: true});

/* math.* */
const FINITE = v => Number.isFinite(v) ? v : null;
const m1 = (name, f) => def('math.' + name, ['number'], a => isna(a[0]) ? null : FINITE(f(a[0])));
m1('abs', Math.abs); m1('sqrt', Math.sqrt); m1('log', Math.log); m1('log10', Math.log10); m1('exp', Math.exp); m1('floor', Math.floor); m1('ceil', Math.ceil);
m1('sign', Math.sign); m1('sin', Math.sin); m1('cos', Math.cos); m1('tan', Math.tan); m1('asin', Math.asin); m1('acos', Math.acos); m1('atan', Math.atan);
m1('todegrees', x => x * 180 / Math.PI); m1('toradians', x => x * Math.PI / 180);
def('math.round', ['number', 'precision'], a => { if (isna(a[0])) return null; const p = a[1] || 0, f = 10 ** p, x = a[0] * f; return (x < 0 ? -Math.round(-x) : Math.round(x)) / f; });
def('math.round_to_mintick', ['number'], (a, c) => isna(a[0]) ? null : Math.round(a[0] / c.ctx.mintick) * c.ctx.mintick);
def('math.pow', ['base', 'exponent'], a => isna(a[0]) || isna(a[1]) ? null : FINITE(a[0] ** a[1]));
def('math.max', null, a => a.length && !a.some(isna) ? Math.max(...a) : null);
def('math.min', null, a => a.length && !a.some(isna) ? Math.min(...a) : null);
def('math.avg', null, a => a.length && !a.some(isna) ? a.reduce((t, v) => t + v, 0) / a.length : null);
def('math.sum', S1, (a, c) => sumw(c.st, c.ctx.bar, a[0], LEN(a[1])));
def('ta.sum', S1, (a, c) => sumw(c.st, c.ctx.bar, a[0], LEN(a[1]))); // alias que usan algunos scripts
def('math.random', ['min', 'max', 'seed'], a => (a[0] === undefined ? 0 : a[0]) + Math.random() * ((a[1] === undefined ? 1 : a[1]) - (a[0] === undefined ? 0 : a[0])));

/* str.* */
let curMintick = 0.01; // se fija al empezar cada ejecución
const tickDec = () => { const m = String(curMintick), i = m.indexOf('.'); if (/e-/.test(m)) return Math.min(10, +m.split('e-')[1]); return i < 0 ? 0 : Math.min(10, m.length - i - 1); };
const group3 = t => t.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const fmtNum = (x, f) => {
  if (isna(x)) return 'NaN';
  if (f === 'mintick' || f === 'price') return x.toFixed(tickDec());
  if (f === 'percent') return (x * 100).toFixed(tickDec()) + '%';
  if (f === 'volume') { const ax = Math.abs(x), r = (v, u) => String(+(v).toFixed(3)) + u; return ax >= 1e12 ? r(x / 1e12, 'T') : ax >= 1e9 ? r(x / 1e9, 'B') : ax >= 1e6 ? r(x / 1e6, 'M') : ax >= 1e3 ? r(x / 1e3, 'K') : String(+x.toFixed(3)); }
  if (typeof f === 'string' && /[#0]/.test(f)) {
    const m = /^([^#0,.]*)([#0,]*)(?:\.([#0]*))?(%?)(.*)$/.exec(f); if (!m) return String(+x.toFixed(10));
    const [, pre, ip, dp = '', pc, suf] = m, v = pc ? x * 100 : x, mand = (dp.match(/0/g) || []).length;
    let t = Math.abs(v).toFixed(dp.length); if (dp.length) { let [i, d] = t.split('.'); d = d.replace(/0+$/, ''); while (d.length < mand) d += '0'; t = d.length ? i + '.' + d : i; }
    const minInt = (ip.match(/0/g) || []).length; let [i, d] = t.split('.'); if (i.length < minInt) i = i.padStart(minInt, '0'); if (ip.includes(',')) i = group3(i);
    return (v < 0 && +t !== 0 ? '-' : '') + pre + i + (d !== undefined ? '.' + d : '') + (pc ? '%' : '') + suf;
  }
  return String(+x.toFixed(10));
};
const toStr = (v, f) => typeof v === 'number' ? fmtNum(v, f) : isna(v) ? 'NaN' : v instanceof Col ? '#' + [v.r, v.g, v.b].map(x => x.toString(16).padStart(2, '0')).join('') : String(v);
def('str.tostring', ['value', 'format'], a => toStr(a[0], a[1]));
def('str.tonumber', ['string'], a => { const x = parseFloat(a[0]); return Number.isFinite(x) ? x : null; });
def('str.length', ['string'], a => isna(a[0]) ? null : String(a[0]).length);
def('str.upper', ['string'], a => String(a[0]).toUpperCase()); def('str.lower', ['string'], a => String(a[0]).toLowerCase());
def('str.contains', ['source', 'str'], a => String(a[0]).includes(a[1])); def('str.startswith', ['source', 'str'], a => String(a[0]).startsWith(a[1])); def('str.endswith', ['source', 'str'], a => String(a[0]).endsWith(a[1]));
def('str.substring', ['source', 'begin_pos', 'end_pos'], a => String(a[0]).substring(a[1], a[2] === undefined ? undefined : a[2]));
def('str.pos', ['source', 'str'], a => { if (isna(a[0]) || isna(a[1])) return null; const i = String(a[0]).indexOf(a[1]); return i < 0 ? null : i; });
def('str.repeat', ['source', 'repeat', 'separator'], a => { const n = Math.min(1000, Math.max(0, a[1] | 0)); return isna(a[0]) ? null : Array(n).fill(String(a[0])).join(a[2] === undefined ? '' : a[2]); });
def('str.format_time', ['time', 'format', 'timezone'], a => { if (isna(a[0])) return null; const d = new Date(a[0]), z = x => String(x).padStart(2, '0'), f = a[1] === undefined ? 'yyyy-MM-dd\'T\'HH:mm:ssZ' : String(a[1]); return f.replace(/'([^']*)'|yyyy|yy|MM|dd|HH|hh|mm|ss|Z/g, (m, q) => q !== undefined ? q : m === 'yyyy' ? d.getUTCFullYear() : m === 'yy' ? z(d.getUTCFullYear() % 100) : m === 'MM' ? z(d.getUTCMonth() + 1) : m === 'dd' ? z(d.getUTCDate()) : m === 'HH' ? z(d.getUTCHours()) : m === 'hh' ? z(d.getUTCHours() % 12 || 12) : m === 'mm' ? z(d.getUTCMinutes()) : m === 'ss' ? z(d.getUTCSeconds()) : '+0000'); });
def('str.replace_all', ['source', 'target', 'replacement'], a => String(a[0]).split(a[1]).join(a[2]));
def('str.replace', ['source', 'target', 'replacement', 'occurrence'], a => String(a[0]).replace(a[1], () => a[2]));
def('str.trim', ['source'], a => String(a[0]).trim());
def('str.split', ['string', 'separator'], a => String(a[0]).split(a[1]));
def('str.format', null, a => String(a[0]).replace(/\{(\d+)(?:,number,([^}]*))?\}/g, (m, i, f) => { const v = a[+i + 1]; return v === undefined ? m : toStr(v, f); }));

/* array.* */
const arrOf = (v, line) => { if (!Array.isArray(v)) throw new PineError('Se esperaba un array', line); return v; };
const ai = (arr, i, line) => { if (!isna(i) && i < 0 && i >= -arr.length) i = arr.length + i; /* índices negativos cuentan desde el final (como en Pine) */ if (isna(i) || i < 0 || i >= arr.length) throw new PineError(`Índice ${i} fuera del array (tamaño ${arr.length})`, line); return Math.trunc(i); };
const MAXARR = 100000;
for (const t of ['float', 'int', 'bool', 'string', 'color']) def('array.new_' + t, ['size', 'initial_value'], (a, c) => { const n = a[0] || 0; if (n > MAXARR) throw new PineError('Array demasiado grande', c.line); return new Array(n).fill(a[1] === undefined ? null : a[1]); });
for (const t of ['label', 'line', 'box', 'linefill', 'table', 'polyline']) def('array.new_' + t, ['size', 'initial_value'], (a, c) => new Array(Math.min(MAXARR, a[0] || 0)).fill(a[1] === undefined ? null : a[1]));
def('array.new', ['size', 'initial_value'], (a, c) => { const n = a[0] || 0; if (n > MAXARR) throw new PineError('Array demasiado grande', c.line); return new Array(n).fill(a[1] === undefined ? null : a[1]); });
def('array.from', null, a => a.slice());
def('array.push', ['id', 'value'], (a, c) => { const r = arrOf(a[0], c.line); if (r.length >= MAXARR) throw new PineError('Array demasiado grande', c.line); r.push(a[1] === undefined ? null : a[1]); return null; });
def('array.pop', ['id'], (a, c) => { const r = arrOf(a[0], c.line); if (!r.length) throw new PineError('pop() sobre un array vacío', c.line); return r.pop(); });
def('array.shift', ['id'], (a, c) => { const r = arrOf(a[0], c.line); if (!r.length) throw new PineError('shift() sobre un array vacío', c.line); return r.shift(); });
def('array.unshift', ['id', 'value'], (a, c) => { arrOf(a[0], c.line).unshift(a[1]); return null; });
def('array.get', ['id', 'index'], (a, c) => { const r = arrOf(a[0], c.line); return r[ai(r, a[1], c.line)]; });
def('array.set', ['id', 'index', 'value'], (a, c) => { const r = arrOf(a[0], c.line); r[ai(r, a[1], c.line)] = a[2]; return null; });
def('array.size', ['id'], (a, c) => arrOf(a[0], c.line).length);
def('array.clear', ['id'], (a, c) => { arrOf(a[0], c.line).length = 0; return null; });
def('array.insert', ['id', 'index', 'value'], (a, c) => { arrOf(a[0], c.line).splice(a[1], 0, a[2]); return null; });
def('array.remove', ['id', 'index'], (a, c) => { const r = arrOf(a[0], c.line); return r.splice(ai(r, a[1], c.line), 1)[0]; });
def('array.includes', ['id', 'value'], (a, c) => arrOf(a[0], c.line).includes(a[1]));
def('array.indexof', ['id', 'value'], (a, c) => arrOf(a[0], c.line).indexOf(a[1]));
def('array.first', ['id'], (a, c) => { const r = arrOf(a[0], c.line); if (!r.length) throw new PineError('first() sobre un array vacío', c.line); return r[0]; });
def('array.last', ['id'], (a, c) => { const r = arrOf(a[0], c.line); if (!r.length) throw new PineError('last() sobre un array vacío', c.line); return r[r.length - 1]; });
def('array.sum', ['id'], (a, c) => arrOf(a[0], c.line).reduce((t, v) => t + (isna(v) ? 0 : v), 0));
def('array.avg', ['id'], (a, c) => { const r = arrOf(a[0], c.line).filter(v => !isna(v)); return r.length ? r.reduce((t, v) => t + v, 0) / r.length : null; });
def('array.max', ['id'], (a, c) => { const r = arrOf(a[0], c.line).filter(v => !isna(v)); return r.length ? Math.max(...r) : null; });
def('array.min', ['id'], (a, c) => { const r = arrOf(a[0], c.line).filter(v => !isna(v)); return r.length ? Math.min(...r) : null; });
def('array.reverse', ['id'], (a, c) => { arrOf(a[0], c.line).reverse(); return null; });
def('array.sort', ['id', 'order'], (a, c) => { const r = arrOf(a[0], c.line), d = a[1] === 'descending' ? -1 : 1; r.sort((x, y) => d * (x < y ? -1 : x > y ? 1 : 0)); return null; });
const nums = (a, c) => arrOf(a[0], c.line).filter(v => typeof v === 'number' && !isNaN(v));
def('array.variance', ['id', 'biased'], (a, c) => { const r = nums(a, c); if (!r.length) return null; const m = r.reduce((x, y) => x + y, 0) / r.length, ss = r.reduce((x, y) => x + (y - m) ** 2, 0); return a[1] === false ? (r.length > 1 ? ss / (r.length - 1) : null) : ss / r.length; });
def('array.standardize', ['id'], (a, c) => { const r = arrOf(a[0], c.line).filter(x => !isna(x)); if (!r.length) return []; const m = r.reduce((x, y) => x + y, 0) / r.length, sd = Math.sqrt(r.reduce((x, y) => x + (y - m) * (y - m), 0) / r.length); return arrOf(a[0], c.line).map(x => isna(x) ? null : sd ? (x - m) / sd : 0); });
def('array.stdev', ['id', 'biased'], (a, c) => { const v = B['array.variance'].f(a, c); return v === null ? null : Math.sqrt(v); });
def('array.median', ['id'], (a, c) => { const r = nums(a, c).sort((x, y) => x - y); if (!r.length) return null; const m = r.length >> 1; return r.length % 2 ? r[m] : (r[m - 1] + r[m]) / 2; });
def('array.mode', ['id'], (a, c) => { const r = nums(a, c), cnt = new Map(); for (const v of r) cnt.set(v, (cnt.get(v) || 0) + 1); let best = null, bc = 0; for (const [v, k] of cnt) if (k > bc || (k === bc && v < best)) { best = v; bc = k; } return best; });
def('array.range', ['id'], (a, c) => { const r = nums(a, c); return r.length ? Math.max(...r) - Math.min(...r) : null; });
def('array.percentile_linear_interpolation', ['id', 'percentage'], (a, c) => { const r = nums(a, c).sort((x, y) => x - y); if (!r.length) return null; const k = (a[1] / 100) * (r.length - 1), f = Math.floor(k), t = Math.ceil(k); return r[f] + (r[t] - r[f]) * (k - f); });
def('array.percentile_nearest_rank', ['id', 'percentage'], (a, c) => { const r = nums(a, c).sort((x, y) => x - y); if (!r.length) return null; return r[Math.min(r.length - 1, Math.max(0, Math.ceil(a[1] / 100 * r.length) - 1))]; });
def('array.percentrank', ['id', 'index'], (a, c) => { const r = arrOf(a[0], c.line), v = r[a[1]]; if (typeof v !== 'number') return null; return r.filter(x => typeof x === 'number' && x <= v).length / r.length * 100 - 100 / r.length; });
def('array.covariance', ['id1', 'id2', 'biased'], (a, c) => { const x = arrOf(a[0], c.line), y = arrOf(a[1], c.line), n = Math.min(x.length, y.length); if (!n) return null; const mx = x.slice(0, n).reduce((p, q) => p + q, 0) / n, my = y.slice(0, n).reduce((p, q) => p + q, 0) / n; let s = 0; for (let i = 0; i < n; i++) s += (x[i] - mx) * (y[i] - my); return a[2] === false ? s / (n - 1) : s / n; });
def('array.abs', ['id'], (a, c) => arrOf(a[0], c.line).map(v => typeof v === 'number' ? Math.abs(v) : v));
def('array.lastindexof', ['id', 'value'], (a, c) => arrOf(a[0], c.line).lastIndexOf(a[1]));
def('array.binary_search', ['id', 'val'], (a, c) => { const r = arrOf(a[0], c.line); let lo = 0, hi = r.length - 1; while (lo <= hi) { const m = (lo + hi) >> 1; if (r[m] === a[1]) return m; if (r[m] < a[1]) lo = m + 1; else hi = m - 1; } return -1; });
def('array.binary_search_leftmost', ['id', 'val'], (a, c) => { const r = arrOf(a[0], c.line); let lo = 0, hi = r.length; while (lo < hi) { const m = (lo + hi) >> 1; if (r[m] < a[1]) lo = m + 1; else hi = m; } return lo; });
def('array.binary_search_rightmost', ['id', 'val'], (a, c) => { const r = arrOf(a[0], c.line); let lo = 0, hi = r.length; while (lo < hi) { const m = (lo + hi) >> 1; if (r[m] <= a[1]) lo = m + 1; else hi = m; } return lo; });
def('array.sort_indices', ['id', 'order'], (a, c) => { const r = arrOf(a[0], c.line), d = a[1] === 'descending' ? -1 : 1; return r.map((v, i) => i).sort((i, j) => d * (r[i] - r[j])); });
def('array.copy', ['id'], (a, c) => arrOf(a[0], c.line).slice());
def('array.slice', ['id', 'index_from', 'index_to'], (a, c) => arrOf(a[0], c.line).slice(a[1], a[2]));
def('array.concat', ['id1', 'id2'], (a, c) => { arrOf(a[0], c.line).push(...arrOf(a[1], c.line)); return a[0]; });
def('array.fill', ['id', 'value', 'index_from', 'index_to'], (a, c) => { arrOf(a[0], c.line).fill(a[1], a[2], a[3]); return null; });
def('array.join', ['id', 'separator'], (a, c) => arrOf(a[0], c.line).map(v => toStr(v)).join(a[1] === undefined ? ',' : a[1]));

/* map.* */
def('map.new', null, () => ({_kind: 'map', m: new Map()}));
def('map.put_all', ['id', 'id2'], (a, c) => { const m = a[0], o = a[1]; if (!m || !m.m || !o || !o.m) throw new PineError('Se esperaba un map', c.line); for (const [k, v] of o.m) m.m.set(k, v); return null; });
def('map.put', ['id', 'key', 'value'], (a, c) => { const m = a[0]; if (!m || !m.m) throw new PineError('Se esperaba un map', c.line); const old = m.m.has(a[1]) ? m.m.get(a[1]) : null; m.m.set(a[1], a[2] === undefined ? null : a[2]); return old; });
def('map.get', ['id', 'key'], (a, c) => { const m = a[0]; if (!m || !m.m) throw new PineError('Se esperaba un map', c.line); return m.m.has(a[1]) ? m.m.get(a[1]) : null; });
def('map.contains', ['id', 'key'], a => !!(a[0] && a[0].m.has(a[1])));
def('map.remove', ['id', 'key'], a => { if (!a[0] || !a[0].m) return null; const v = a[0].m.has(a[1]) ? a[0].m.get(a[1]) : null; a[0].m.delete(a[1]); return v; });
def('map.size', ['id'], a => a[0] && a[0].m ? a[0].m.size : null); def('map.clear', ['id'], a => { if (a[0] && a[0].m) a[0].m.clear(); return null; });
def('map.keys', ['id'], a => a[0] && a[0].m ? [...a[0].m.keys()] : []); def('map.values', ['id'], a => a[0] && a[0].m ? [...a[0].m.values()] : []);
def('map.copy', ['id'], a => a[0] && a[0].m ? {_kind: 'map', m: new Map(a[0].m)} : null);
/* color.* */
for (const k of ['line', 'label', 'box', 'table', 'linefill', 'polyline', 'chart.point']) def(k, ['x'], a => a[0] === undefined ? null : a[0]); // conversiones «line(na)», «label(na)»…
def('color.new', ['color', 'transp'], a => a[0] instanceof Col ? new Col(a[0].r, a[0].g, a[0].b, isna(a[1]) ? 0 : clamp(a[1], 0, 100)) : null);
def('color.rgb', ['red', 'green', 'blue', 'transp'], a => a.slice(0, 3).some(isna) ? null : new Col(clamp(Math.round(a[0]), 0, 255), clamp(Math.round(a[1]), 0, 255), clamp(Math.round(a[2]), 0, 255), a[3] || 0));
def('color.from_gradient', ['value', 'bottom_value', 'top_value', 'bottom_color', 'top_color'], a => {
  const [v, lo, hi, c1, c2] = a; if (isna(v) || isna(lo) || isna(hi) || !(c1 instanceof Col) || !(c2 instanceof Col)) return null;
  const t = hi === lo ? 0 : clamp01((v - lo) / (hi - lo)), mix = (x, y) => x + (y - x) * t;
  return new Col(Math.round(mix(c1.r, c2.r)), Math.round(mix(c1.g, c2.g)), Math.round(mix(c1.b, c2.b)), mix(c1.t, c2.t));
});
def('color.r', ['color'], a => a[0] ? a[0].r : null); def('color.g', ['color'], a => a[0] ? a[0].g : null); def('color.b', ['color'], a => a[0] ? a[0].b : null); def('color.t', ['color'], a => a[0] ? a[0].t : null);
function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

/* time(timeframe, session, timezone) */
function periodStart(t, tf) {
  const m = /^(\d*)([A-Za-z]?)$/.exec(String(tf).trim()); if (!m) return null; const k = m[1] === '' ? 1 : +m[1], u = m[2];
  if (u === '' || u === 'm') return Math.floor(t / (k * 6e4)) * k * 6e4;
  if (u === 'h' || u === 'H') return Math.floor(t / (k * 36e5)) * k * 36e5;
  if (u === 'D' || u === 'd') return Math.floor(t / (k * 864e5)) * k * 864e5;
  if (u === 'W' || u === 'w') { const d = Math.floor(t / 864e5), w = Math.floor((d + 3) / (7 * k)); return (w * 7 * k - 3) * 864e5; }
  if (u === 'M') { const d = new Date(t), mi = d.getUTCFullYear() * 12 + d.getUTCMonth(), b = Math.floor(mi / k) * k; return Date.UTC(Math.floor(b / 12), b % 12, 1); }
  return null;
}
const tzFmt = new Map();
function localParts(t, tz) { // hora local (min del día) y día de la semana (1=domingo) en una zona horaria
  tz = String(tz || 'UTC'); let off = null; const m = /^(?:UTC|GMT)([+-])(\d{1,2})(?::?(\d{2}))?$/i.exec(tz);
  if (/^(UTC|GMT|Etc\/UTC|Etc\/GMT|Z)$/i.test(tz)) off = 0; else if (m) off = (m[1] === '-' ? -1 : 1) * ((+m[2]) * 60 + (+(m[3] || 0)));
  if (off !== null) { const d = new Date(t + off * 6e4); return {min: d.getUTCHours() * 60 + d.getUTCMinutes(), dow: d.getUTCDay() + 1}; }
  let f = tzFmt.get(tz); if (!f) { try { f = new Intl.DateTimeFormat('en-US', {timeZone: tz, hourCycle: 'h23', hour: 'numeric', minute: 'numeric', weekday: 'short'}); } catch { f = null; } tzFmt.set(tz, f); }
  if (!f) return null; const o = {}; for (const q of f.formatToParts(new Date(t))) o[q.type] = q.value;
  return {min: (+o.hour % 24) * 60 + +o.minute, dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(o.weekday) + 1};
}
function inSession(t, sess, tz) {
  const m = /^(\d{2})(\d{2})-(\d{2})(\d{2})(?::(\d+))?$/.exec(String(sess).replace(/\s/g, '')); if (!m) return undefined;
  const a = +m[1] * 60 + +m[2], b = +m[3] * 60 + +m[4], days = m[5] || '1234567', lp = localParts(t, tz); if (!lp) return undefined;
  if (a === b) return days.includes(String(lp.dow)); // 24 h
  if (a < b) return lp.min >= a && lp.min < b && days.includes(String(lp.dow));
  if (lp.min >= a) return days.includes(String(lp.dow));
  if (lp.min < b) return days.includes(String(lp.dow === 1 ? 7 : lp.dow - 1)); // la parte posterior a medianoche pertenece al día en que empezó
  return false;
}
def('time', ['timeframe', 'session', 'timezone'], (a, c) => {
  const ctx = c.ctx, t = ctx.candles[ctx.bar].t, tf = isna(a[0]) || a[0] === '' ? tfPeriod(ctx.interval) : a[0];
  const ps = periodStart(t, tf); if (ps === null) { warn(ctx, c.line, `time("${tf}") no soportado`, 'time:' + tf, 'unsupported'); ctx.incomplete = true; return null; }
  if (!isna(a[1]) && a[1] !== '') { const ok = inSession(t, a[1], a[2]); if (ok === undefined) { warn(ctx, c.line, `Sesión «${a[1]}» o zona «${a[2]}» no reconocida: se trata como fuera de sesión`, 'sess:' + a[1], 'unsupported'); ctx.incomplete = true; return null; } if (!ok) return null; }
  return ps;
});

/* hour(time, timezone), minute(), dayofmonth()… como funciones (además de las variables de la vela actual) */
const tzFull = new Map();
function zoned(t, tz) { // {y, mo, d, h, mi, s, dow} de un instante en una zona horaria («UTC+3», «GMT-5», «America/New_York»…)
  if (isna(t)) return null; tz = tz === undefined || isna(tz) || tz === '' ? 'UTC' : String(tz);
  const m = /^(?:UTC|GMT)([+-])(\d{1,2})(?::?(\d{2}))?$/i.exec(tz); let off = /^(UTC|GMT|Etc\/UTC|Etc\/GMT|Z)$/i.test(tz) ? 0 : m ? (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +(m[3] || 0)) : null;
  if (off === null) { let f = tzFull.get(tz); if (f === undefined) { try { f = new Intl.DateTimeFormat('en-US', {timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric'}); } catch { f = null; } tzFull.set(tz, f); }
    if (f) { const o = {}; for (const q of f.formatToParts(new Date(t))) o[q.type] = q.value; off = Math.round((Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour % 24, +o.minute, +o.second) - Math.floor(t / 1000) * 1000) / 6e4); } else off = 0; }
  const d = new Date(t + off * 6e4); return {y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds(), dow: d.getUTCDay() + 1, ms: d.getTime()};
}
for (const [nm, f] of [['hour', z => z.h], ['minute', z => z.mi], ['second', z => z.s], ['dayofmonth', z => z.d], ['dayofweek', z => z.dow], ['month', z => z.mo], ['year', z => z.y], ['weekofyear', z => { const s0 = Date.UTC(z.y, 0, 1); return Math.floor((z.ms - s0) / 864e5 / 7) + 1; }]])
  def(nm, ['time', 'timezone'], (a, c) => { const t = a[0] === undefined ? c.ctx.candles[c.ctx.bar].t : a[0], z = zoned(t, a[1]); return z ? f(z) : null; });
def('time_close', ['timeframe', 'session', 'timezone'], (a, c) => {
  const ctx = c.ctx, t = ctx.candles[ctx.bar].t, tf = isna(a[0]) || a[0] === undefined || a[0] === '' ? tfPeriod(ctx.interval) : a[0], ps = periodStart(t, tf); if (ps === null) return null;
  if (!isna(a[1]) && a[1] !== undefined && a[1] !== '' && !inSession(t, a[1], a[2])) return null;
  const m = /^(\d*)([A-Za-z]?)$/.exec(String(tf).trim()), k = m && m[1] !== '' ? +m[1] : 1, u = m ? m[2] : '';
  if (u === '' || u === 'm') return ps + k * 6e4; if (u === 'h' || u === 'H') return ps + k * 36e5; if (u === 'D' || u === 'd') return ps + k * 864e5; if (u === 'W' || u === 'w') return ps + k * 6048e5;
  if (u === 'M') { const d = new Date(ps); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + k, 1); } return ps + ctx.ms;
});
/* request.security_lower_tf: aproximación con la vela del gráfico (un solo elemento en el array) */
def('request.security_lower_tf', ['symbol', 'timeframe', 'expression', 'ignore_invalid_symbol', 'currency', 'ignore_invalid_timeframe', 'calc_bars_count'], (a, c) => {
  warn(c.ctx, c.line, 'request.security_lower_tf() usa la vela del gráfico (aproximación: no hay velas menores aquí)', 'sltf', 'fix'); return isna(a[2]) ? [] : [a[2]];
}, {lenient: true});

def('str.match', ['source', 'regex'], a => { if (isna(a[0]) || isna(a[1])) return ''; try { const m = new RegExp(String(a[1])).exec(String(a[0])); return m ? m[0] : ''; } catch { return ''; } });
/* timeframe.* y request.* */
def('timeframe.in_seconds', ['timeframe'], (a, c) => { const m = TF_MIN[a[0] === undefined || a[0] === '' ? c.ctx.interval : a[0]] || (isNaN(+a[0]) ? null : +a[0]); return m ? m * 60 : null; });
def('timeframe.change', ['timeframe'], (a, c) => {
  const ctx = c.ctx, t = ctx.candles[ctx.bar].t, p = ctx.bar > 0 ? ctx.candles[ctx.bar - 1].t : null, tf = String(a[0]);
  if (p === null) return true;
  const key = (x) => { const d = new Date(x); if (/^(1?D|1d)$/i.test(tf)) return Math.floor(x / 864e5); if (/^(1?W|1w)$/i.test(tf)) return Math.floor((x / 864e5 + 3) / 7); if (/^(1?M|1M)$/.test(tf)) return d.getUTCFullYear() * 12 + d.getUTCMonth(); const mo = /^(\d+)M$/.exec(tf); if (mo) return Math.floor((d.getUTCFullYear() * 12 + d.getUTCMonth()) / +mo[1]); const dd = /^(\d+)D$/i.exec(tf); if (dd) return Math.floor(x / 864e5 / +dd[1]); const ww = /^(\d+)W$/i.exec(tf); if (ww) return Math.floor((x / 864e5 + 3) / 7 / +ww[1]); const hh = /^(\d+)[hH]$/.exec(tf); const m = hh ? +hh[1] * 60 : /^(\d+)$/.test(tf) ? +tf : TF_MIN[tf]; return m ? Math.floor(x / (m * 60000)) : null; };
  const k1 = key(t), k0 = key(p); if (k1 === null) { warn(ctx, c.line, `timeframe.change('${tf}') no soportado`, 'tfc', 'unsupported'); ctx.incomplete = true; return null; }
  return k1 !== k0;
});
def('request.security', ['symbol', 'timeframe', 'expression', 'gaps', 'lookahead', 'ignore_invalid_symbol', 'currency', 'calc_bars_count'], (a, c) => {
  const ctx = c.ctx, sym = a[0], tf = a[1];
  const symOk = isna(sym) || sym === '' || sym === ctx.symbol || sym === 'BINANCE:' + ctx.symbol;
  const tfOk = isna(tf) || tf === '' || tf === ctx.interval || tf === tfPeriod(ctx.interval);
  if (symOk && tfOk) return a[2];
  warn(ctx, c.line, 'request.security() con otro símbolo o temporalidad todavía no está soportado: devuelve na (solo funciona con el símbolo y la temporalidad del gráfico)', 'sec', 'unsupported'); ctx.incomplete = true; return null;
}, {lenient: true});

/* ───────────── indicator / strategy / input ───────────── */
function pal(ctx, col) {
  if (!(col instanceof Col)) return null;
  const k = col.r + ',' + col.g + ',' + col.b + ',' + col.t; let i = ctx.pal.get(k);
  if (i === undefined) { i = ctx.out.palette.length; ctx.out.palette.push(`rgba(${col.r},${col.g},${col.b},${(1 - col.t / 100).toFixed(3)})`); ctx.pal.set(k, i); }
  return i;
}
const IND_SIG = ['title', 'shorttitle', 'overlay', 'format', 'precision', 'scale', 'max_bars_back', 'timeframe', 'timeframe_gaps', 'explicit_plot_zorder', 'max_lines_count', 'max_labels_count', 'max_boxes_count', 'calc_bars_count', 'dynamic_requests', 'behind_chart', 'max_polylines_count'];
function setMeta(kind) {
  return (a, c) => {
    const m = c.ctx.out.meta; m.kind = kind; if (typeof a[0] === 'string') m.title = a[0]; if (typeof a[1] === 'string') m.short = a[1];
    m.overlay = a[2] === true; if (a[10]) m.maxLines = Math.min(500, a[10]); if (a[11]) m.maxLabels = Math.min(500, a[11]); if (a[12]) m.maxBoxes = Math.min(500, a[12]); if (a[16]) m.maxPolylines = Math.min(100, a[16]);
    if (typeof a[7] === 'string' && a[7] !== '') warn(c.ctx, c.line, `El parámetro timeframe de ${kind}() se ignora (el script se calcula en la temporalidad del gráfico)`, 'ind-tf', 'unsupported');
    return null;
  };
}
def('indicator', IND_SIG, setMeta('indicator'), {lenient: true});
def('study', IND_SIG, setMeta('indicator'), {lenient: true});
def('library', null, (a, c) => { throw new PineError('Las bibliotecas («library») no se pueden ejecutar en el gráfico', c.line); });

const SRC_NAMES = ['open', 'high', 'low', 'close', 'hl2', 'hlc3', 'ohlc4', 'hlcc4', 'volume'];
function encodeIn(type, v) { return v instanceof Col ? '#' + [v.r, v.g, v.b].map(x => x.toString(16).padStart(2, '0')).join('') + (v.t > 0 ? Math.round((1 - v.t / 100) * 255).toString(16).padStart(2, '0') : '') : v; }
function regInput(c, type, defv, info) {
  const s = c.st, o = c.ctx.out;
  if (!s.reg) {
    const key = String(o.inputs.length), ov = c.ctx.opts.inputs ? c.ctx.opts.inputs[key] : undefined; let val = defv;
    if (ov !== undefined && ov !== null) {
      if (type === 'int') { val = Math.round(+ov); if (!Number.isFinite(val)) val = defv; }
      else if (type === 'float' || type === 'time') { val = +ov; if (!Number.isFinite(val)) val = defv; }
      else if (type === 'bool') val = ov === true || ov === 'true';
      else if (type === 'color') val = typeof ov === 'string' && /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(ov) ? hexCol(ov) : defv;
      else val = ov;
      if ((type === 'int' || type === 'float') && typeof val === 'number') { if (info.min != null && val < info.min) val = info.min; if (info.max != null && val > info.max) val = info.max; }
    }
    s.val = val; const mt = c.meta || {};
    if (mt.group !== undefined && typeof mt.group === 'string' && !info.group) info.group = mt.group;
    if (typeof mt.tooltip === 'string' && !info.tooltip) info.tooltip = mt.tooltip;
    if (typeof mt.inline === 'string') info.inline = mt.inline;
    s.reg = Object.assign({key, title: typeof info.title === 'string' ? info.title : '', type, def: encodeIn(type, defv), value: encodeIn(type, val)}, info.min != null ? {min: info.min} : {}, info.max != null ? {max: info.max} : {}, info.step != null ? {step: info.step} : {}, info.options ? {options: info.options} : {}, info.group ? {group: info.group} : {}, info.tooltip ? {tooltip: info.tooltip} : {}, info.inline ? {inline: info.inline} : {}, {order: o.inputs.length});
    o.inputs.push(s.reg);
  }
  return s.val;
}
const optsOf = v => v instanceof Tup ? v.a.filter(x => !isna(x)) : Array.isArray(v) ? v : null;
const numIn = type => (a, c) => { const optv = optsOf(a[10]) || optsOf(a[2]), opt = !!optv; return regInput(c, type, isna(a[0]) ? 0 : a[0], {title: a[1], options: optv, min: opt && optsOf(a[2]) ? null : a[2], max: opt ? null : a[3], step: opt ? null : a[4], tooltip: a[5], group: a[7]}); };
const NUMSIG = ['defval', 'title', 'minval', 'maxval', 'step', 'tooltip', 'inline', 'group', 'confirm', 'display', 'options'];
def('input.int', NUMSIG, numIn('int'), {lenient: true}); def('input.float', NUMSIG, numIn('float'), {lenient: true});
def('input.bool', ['defval', 'title', 'tooltip', 'inline', 'group', 'confirm', 'display'], (a, c) => regInput(c, 'bool', a[0] === true, {title: a[1], tooltip: a[2], group: a[4]}), {lenient: true});
const strIn = type => (a, c) => regInput(c, type, a[0] === undefined ? '' : a[0], {title: a[1], options: optsOf(a[2]), tooltip: a[3], group: a[5]});
const STRSIG = ['defval', 'title', 'options', 'tooltip', 'inline', 'group', 'confirm', 'display'];
for (const t of ['string', 'timeframe', 'symbol', 'session', 'text_area']) def('input.' + t, STRSIG, strIn(t === 'text_area' ? 'string' : t), {lenient: true});
def('input.color', ['defval', 'title', 'tooltip', 'inline', 'group', 'confirm', 'display'], (a, c) => regInput(c, 'color', a[0] instanceof Col ? a[0] : hexCol('2962FF'), {title: a[1], tooltip: a[2], group: a[4]}), {lenient: true});
def('input.time', ['defval', 'title', 'tooltip', 'inline', 'group', 'confirm', 'display'], (a, c) => regInput(c, 'time', a[0] || 0, {title: a[1], tooltip: a[2], group: a[4]}), {lenient: true});
def('input.source', ['defval', 'title', 'tooltip', 'inline', 'group', 'display'], (a, c) => {
  const arg = c.node.args[0] && !c.node.args[0].name ? c.node.args[0].e : (c.node.args.find(x => x.name === 'defval') || {}).e;
  const defName = arg && arg.k === 'id' && SRC_NAMES.includes(arg.name) ? arg.name : null;
  const pick = regInput(c, 'source', defName || 'close', {title: a[1], options: SRC_NAMES, tooltip: a[2], group: a[4]});
  if (defName || SRC_NAMES.includes(pick)) return seriesAt(c.ctx, pick, c.ctx.bar);
  return a[0];
}, {lenient: true});
def('ticker.heikinashi', ['symbol'], (a, c) => 'HA:' + (isna(a[0]) ? c.ctx.symbol : String(a[0])), {lenient: true});
for (const nm of ['ticker.new', 'ticker.modify', 'ticker.standard', 'ticker.inherit']) def(nm, ['prefix', 'ticker', 'session'], (a, c) => nm === 'ticker.new' ? (isna(a[1]) ? null : String(a[1])) : (isna(a[0]) ? c.ctx.symbol : String(a[0])), {lenient: true});
def('input.enum', ['defval', 'title', 'options', 'tooltip', 'inline', 'group', 'confirm', 'display'], (a, c) => {
  const opts = (optsOf(a[2]) || []).map(String); const d = isna(a[0]) ? (opts[0] || '') : String(a[0]);
  return regInput(c, 'string', d, {title: a[1], tooltip: a[3], group: a[5], options: opts.length ? opts : null});
}, {lenient: true});
def('input.price', NUMSIG, numIn('float'), {lenient: true});
def('timeframe.from_seconds', ['seconds'], a => { const m = a[0] / 60; if (isna(a[0])) return null; return m >= 43200 ? Math.round(m / 43200) + 'M' : m >= 10080 ? Math.round(m / 10080) + 'W' : m >= 1440 ? Math.round(m / 1440) + 'D' : String(Math.max(1, Math.round(m))); });
def('input', ['defval', 'title', 'type', 'minval', 'maxval', 'step', 'tooltip', 'inline', 'group', 'confirm', 'options'], (a, c) => {
  const a0 = c.node.args[0] && !c.node.args[0].name ? c.node.args[0].e : (c.node.args.find(x => x.name === 'defval') || {}).e;
  if (a[2] === 'source' || (a0 && a0.k === 'id' && SRC_NAMES.includes(a0.name) && !lookup(c.env, a0.name))) return B['input.source'].f([a[0], a[1], a[6], a[7], a[8]], c); // input(close, …): origen de datos, no un número
  const d = a[0], t0 = typeof d === 'boolean' ? 'bool' : typeof d === 'number' ? (Number.isInteger(d) ? 'int' : 'float') : d instanceof Col ? 'color' : 'string';
  const t = a[2] === 'int' || a[2] === 'float' || a[2] === 'bool' || a[2] === 'string' || a[2] === 'color' ? a[2] : a[2] === 'price' ? 'float' : a[2] === 'time' ? 'int' : t0;
  return regInput(c, t, d, {title: a[1], min: a[3], max: a[4], step: a[5], tooltip: a[6], group: a[8], options: optsOf(a[10])});
}, {lenient: true});

/* ───────────── plot / hline / fill / bgcolor / formas ───────────── */
const DEFCOL = hexCol('2962FF');
const hidden = d => typeof d === 'number' && !(d & 1);
const nv = v => isna(v) ? null : (typeof v === 'boolean' ? +v : v);
const PLOT_SIG = ['series', 'title', 'color', 'linewidth', 'style', 'trackprice', 'histbase', 'offset', 'join', 'editable', 'show_last', 'display', 'format', 'precision', 'force_overlay'];
def('plot', PLOT_SIG, (a, c) => {
  const ctx = c.ctx, o = ctx.out; let p = c.st.p;
  if (!p) {
    p = c.st.p = {id: o.plots.length, title: typeof a[1] === 'string' ? a[1] : 'Plot ' + (o.plots.length + 1), style: String(a[4] || 'style_line').replace(/^style_/, ''), lw: a[3] || 2, offset: a[7] || 0, hidden: hidden(a[11]), histbase: a[6] || 0, force: a[14] === true, values: new Array(ctx.n).fill(null), ci: new Array(ctx.n).fill(null)};
    o.plots.push(p);
  }
  const col = a[2] === undefined ? DEFCOL : a[2]; p.values[ctx.bar] = nv(a[0]);
  p.ci[ctx.bar] = col === null ? -1 : (pal(ctx, col));
  return {_kind: 'plot', id: p.id};
}, {lenient: true});
const CANDLE_SIG = ['open', 'high', 'low', 'close', 'title', 'color', 'wickcolor', 'editable', 'show_last', 'bordercolor', 'display', 'format', 'precision', 'force_overlay'];
def('plotcandle', CANDLE_SIG, (a, c) => {
  const ctx = c.ctx, o = ctx.out; let p = c.st.p;
  if (!p) { p = c.st.p = {id: o.candles.length, title: typeof a[4] === 'string' ? a[4] : 'Candle ' + (o.candles.length + 1), hidden: hidden(a[10]), bar: false, o: new Array(ctx.n).fill(null), h: new Array(ctx.n).fill(null), l: new Array(ctx.n).fill(null), c: new Array(ctx.n).fill(null), ci: new Array(ctx.n).fill(null), wci: new Array(ctx.n).fill(null), bci: new Array(ctx.n).fill(null)}; o.candles.push(p); }
  const i = ctx.bar; p.o[i] = nv(a[0]); p.h[i] = nv(a[1]); p.l[i] = nv(a[2]); p.c[i] = nv(a[3]);
  const col = a[5] === undefined ? DEFCOL : a[5]; p.ci[i] = col === null ? -1 : pal(ctx, col);
  p.wci[i] = a[6] instanceof Col ? pal(ctx, a[6]) : p.ci[i]; p.bci[i] = a[9] instanceof Col ? pal(ctx, a[9]) : p.ci[i];
  return null;
}, {lenient: true});
def('plotbar', ['open', 'high', 'low', 'close', 'title', 'color', 'editable', 'show_last', 'display', 'format', 'precision', 'force_overlay'], (a, c) => {
  const r = B['plotcandle'].f([a[0], a[1], a[2], a[3], a[4], a[5], a[5], undefined, undefined, a[5], a[8]], c); if (c.st.p) c.st.p.bar = true; return r;
}, {lenient: true});
def('hline', ['price', 'title', 'color', 'linestyle', 'linewidth', 'editable', 'display'], (a, c) => {
  const o = c.ctx.out; let h = c.st.h;
  if (!h) { h = c.st.h = {id: o.hlines.length, price: nv(a[0]), title: a[1] || '', ci: pal(c.ctx, a[2] === undefined ? hexCol('787B86') : a[2]), style: String(a[3] || 'style_dashed').replace(/^style_/, ''), lw: a[4] || 1, hidden: hidden(a[6])}; o.hlines.push(h); }
  return {_kind: 'hline', id: h.id};
}, {lenient: true});
def('fill', ['hline1', 'hline2', 'color', 'title', 'editable', 'show_last', 'fillgaps', 'display', 'top_value', 'bottom_value', 'top_color', 'bottom_color'], (a, c) => {
  if (!(a[2] instanceof Col) && (a[10] instanceof Col || a[11] instanceof Col) && !(a[2] !== undefined && !isna(a[2]) && typeof a[2] === 'number')) { const tc = a[10] instanceof Col ? a[10] : a[11], bc = a[11] instanceof Col ? a[11] : a[10]; a[2] = isna(a[8]) || isna(a[9]) ? tc : (Math.abs(a[8]) >= Math.abs(a[9]) ? tc : bc); } // relleno degradado: se usa el color del extremo dominante
  else if (typeof a[2] === 'number' && (a[4] instanceof Col || a[5] instanceof Col)) { const tc = a[4] instanceof Col ? a[4] : a[5], bc = a[5] instanceof Col ? a[5] : a[4]; a[2] = isna(a[2]) || isna(a[3]) ? tc : (Math.abs(a[2]) >= Math.abs(a[3]) ? tc : bc); } // degradado con argumentos por posición: fill(p1, p2, top_value, bottom_value, top_color, bottom_color)
  const ctx = c.ctx, o = ctx.out; let f = c.st.f;
  if (!f) {
    const ref = h => h && (h._kind === 'plot' || h._kind === 'hline') ? {kind: h._kind, id: h.id} : null;
    f = c.st.f = {a: ref(a[0]), b: ref(a[1]), ci: new Array(ctx.n).fill(null), hidden: hidden(a[7])};
    if (!f.a || !f.b) throw new PineError('fill() necesita dos plot() o hline()', c.line);
    o.fills.push(f);
  }
  f.ci[ctx.bar] = a[2] instanceof Col ? pal(ctx, a[2]) : null; return null;
}, {lenient: true});
const bgLike = key => (a, c) => {
  const ctx = c.ctx, o = ctx.out; let e = c.st.e;
  if (!e) { e = c.st.e = {pts: [], offset: a[1] || 0}; o[key].push(e); }
  if (a[0] instanceof Col) e.pts.push([ctx.bar, pal(ctx, a[0])]); return null;
};
def('bgcolor', ['color', 'offset', 'editable', 'show_last', 'title', 'display', 'force_overlay'], bgLike('bgcolors'), {lenient: true});
def('barcolor', ['color', 'offset', 'editable', 'show_last', 'title', 'display'], bgLike('barcolors'), {lenient: true});
function shapeFn(kind) {
  const sig = kind === 'shape' ? ['series', 'title', 'style', 'location', 'color', 'offset', 'text', 'textcolor', 'editable', 'size', 'show_last', 'display', 'format', 'precision', 'force_overlay']
    : kind === 'char' ? ['series', 'title', 'char', 'location', 'color', 'offset', 'text', 'textcolor', 'editable', 'size', 'show_last', 'display', 'format', 'precision', 'force_overlay']
    : ['series', 'title', 'colorup', 'colordown', 'offset', 'minheight', 'maxheight', 'editable', 'show_last', 'display', 'format', 'precision', 'force_overlay'];
  def(kind === 'shape' ? 'plotshape' : kind === 'char' ? 'plotchar' : 'plotarrow', sig, (a, c) => {
    const ctx = c.ctx, o = ctx.out; let s = c.st.s;
    if (!s) {
      s = c.st.s = kind === 'arrow' ? {kind, title: a[1] || '', offset: a[4] || 0, pts: []}
        : {kind, title: a[1] || '', style: kind === 'shape' ? String(a[2] || 'xcross').replace(/^style_/, '') : 'char', ch: kind === 'char' ? String(a[2] === undefined ? '•' : a[2]) : null, loc: String(a[3] || 'abovebar'), size: String(a[9] || 'auto'), offset: a[5] || 0, pts: []};
      o.shapes.push(s);
    }
    const v = a[0];
    if (kind === 'arrow') { if (!isna(v) && v !== 0) s.pts.push([ctx.bar, v, pal(ctx, v > 0 ? (a[2] === undefined ? hexCol('00E676') : a[2]) : (a[3] === undefined ? hexCol('F23645') : a[3]))]); return null; }
    if (!isna(v) && v !== false && (v !== 0 || s.loc === 'absolute')) s.pts.push([ctx.bar, nv(v), pal(ctx, a[4] === undefined ? DEFCOL : a[4]), pal(ctx, a[7] === undefined ? hexCol('FFFFFF') : a[7]), a[6] === undefined ? '' : String(a[6])]);
    return null;
  }, {lenient: true});
}
shapeFn('shape'); shapeFn('char'); shapeFn('arrow');

/* ───────────── label / line / box ───────────── */
function keepLimit(ctx, list, key, max) {
  const o = ctx.out; list.push(key); let alive = 0; for (let i = o._p[list.__n] || 0; i < list.length; i++) if (!list[i].deleted) alive++;
  while (alive > max) { let i = o._p[list.__n] || 0; while (i < list.length && list[i].deleted) i++; if (i >= list.length) break; list[i].deleted = true; o._p[list.__n] = i + 1; alive--; }
}
const dcol = (ctx, v, dflt) => pal(ctx, v === undefined ? dflt : v);
def('label.new', ['x', 'y', 'text', 'xloc', 'yloc', 'color', 'style', 'textcolor', 'size', 'textalign', 'tooltip', 'text_font_family', 'force_overlay', 'text_formatting'], (a, c) => {
  const ctx = c.ctx, o = {_kind: 'label', x: isna(a[0]) ? ctx.bar : a[0], y: nv(a[1]), text: a[2] === undefined ? '' : String(a[2]), xloc: String(a[3] || 'bar_index'), yloc: String(a[4] || 'price'), ci: dcol(ctx, a[5], DEFCOL), style: String(a[6] || 'style_label_down').replace(/^style_/, ''), tci: dcol(ctx, a[7], hexCol('FFFFFF')), size: String(a[8] || 'normal')};
  if (ctx.opts && ctx.opts.logLabels) { const lg = ctx.out.labelLog = ctx.out.labelLog || []; if (lg.length < 30000) lg.push([ctx.bar, o.text, o.style]); } // registro de etiquetas (vela donde nacen) para los bots
  keepLimit(ctx, ctx.out.labels, o, ctx.out.meta.maxLabels || 50); return o;
}, {lenient: true});
def('line.new', ['x1', 'y1', 'x2', 'y2', 'xloc', 'extend', 'color', 'style', 'width', 'force_overlay'], (a, c) => {
  const ctx = c.ctx, o = {_kind: 'line', x1: nv(a[0]), y1: nv(a[1]), x2: nv(a[2]), y2: nv(a[3]), xloc: String(a[4] || 'bar_index'), extend: String(a[5] || 'none'), ci: dcol(ctx, a[6], DEFCOL), style: String(a[7] || 'style_solid').replace(/^style_/, ''), w: a[8] || 1};
  keepLimit(ctx, ctx.out.lines, o, ctx.out.meta.maxLines || 50); return o;
}, {lenient: true});
// text_size / text_halign / text_valign de las cajas: se conservan normalizados («auto», «left», «center»…) para que el dibujo ajuste y alinee el texto dentro de cada caja
const boxTxt = (v, kind) => { if (v === undefined || v === null) return undefined; const t = String(v).replace(/^(size|text)\./, '').replace(/^align_/, ''); return t || undefined; };
def('box.new', ['left', 'top', 'right', 'bottom', 'border_color', 'border_width', 'border_style', 'extend', 'xloc', 'bgcolor', 'text', 'text_size', 'text_color', 'text_halign', 'text_valign', 'text_wrap', 'text_font_family', 'force_overlay', 'text_formatting'], (a, c) => {
  const ctx = c.ctx, o = {_kind: 'box', l: nv(a[0]), t: nv(a[1]), r: nv(a[2]), b: nv(a[3]), bci: dcol(ctx, a[4], DEFCOL), bw: a[5] || 1, bstyle: String(a[6] || 'style_solid').replace(/^style_/, ''), extend: String(a[7] || 'none'), xloc: String(a[8] || 'bar_index'), fci: dcol(ctx, a[9], hexCol('2962FF1A')), text: a[10] === undefined ? '' : String(a[10]), tci: dcol(ctx, a[12], hexCol('FFFFFF')), tz: boxTxt(a[11], 'size'), th: boxTxt(a[13], 'halign'), tv: boxTxt(a[14], 'valign')};
  keepLimit(ctx, ctx.out.boxes, o, ctx.out.meta.maxBoxes || 50); return o;
}, {lenient: true});
def('linefill.new', ['line1', 'line2', 'color'], (a, c) => { const o = {_kind: 'linefill', l1: a[0], l2: a[1], ci: dcol(c.ctx, a[2], hexCol('2962FF4D'))}; c.ctx.out.linefills.push(o); if (c.ctx.out.linefills.length > 100) c.ctx.out.linefills.shift(); return o; }, {lenient: true});
def('linefill.delete', ['id'], a => { if (a[0] && a[0]._kind === 'linefill') a[0].deleted = true; return null; });
def('linefill.set_color', ['id', 'color'], (a, c) => { if (a[0] && a[0]._kind === 'linefill') a[0].ci = pal(c.ctx, a[1]); return null; });
def('linefill.get_line1', ['id'], a => a[0] ? a[0].l1 : null); def('linefill.get_line2', ['id'], a => a[0] ? a[0].l2 : null);
for (const kind of ['label', 'line', 'box']) def(kind + '.copy', ['id'], (a, c) => { const o = a[0]; if (!o || o._kind !== kind) return null; const n = Object.assign({}, o, {deleted: false}); const list = c.ctx.out[kind + 's']; keepLimit(c.ctx, list, n, list.length + 1 > 500 ? 500 : 500); return n; });
function setters(kind, map) {
  for (const k in map) def(`${kind}.set_${k}`, ['id', 'a', 'b'], (a, c) => { const o = a[0]; if (o && o._kind === kind) map[k](o, a[1], a[2], c.ctx); return null; }, {lenient: true});
  def(`${kind}.delete`, ['id'], a => { if (a[0] && a[0]._kind === kind) a[0].deleted = true; return null; });
}
const ST = (st, p) => (o, v, _, ctx) => { o[p] = String(v).replace(/^style_/, ''); };
setters('label', {xloc: (o, v) => { o.xloc = String(v); }, yloc: (o, v) => { o.yloc = String(v); }, point: (o, pt) => { if (pt && pt._kind === 'point') { o.x = pt.i !== null ? pt.i : pt.x; o.y = pt.p; } }, x: (o, v) => { o.x = v; }, y: (o, v) => { o.y = nv(v); }, xy: (o, x, y) => { o.x = x; o.y = nv(y); }, text: (o, v) => { o.text = String(v); }, color: (o, v, _, ctx) => { o.ci = pal(ctx, v); }, textcolor: (o, v, _, ctx) => { o.tci = pal(ctx, v); }, style: ST(0, 'style'), size: (o, v) => { o.size = String(v); }, tooltip: () => {}, text_font_family: () => {}, textalign: () => {}});
setters('line', {xloc: (o, v) => { o.xloc = String(v); }, first_point: (o, pt) => { if (pt && pt._kind === 'point') { o.x1 = pt.i; o.y1 = pt.p; } }, second_point: (o, pt) => { if (pt && pt._kind === 'point') { o.x2 = pt.i; o.y2 = pt.p; } }, x1: (o, v) => { o.x1 = v; }, y1: (o, v) => { o.y1 = nv(v); }, x2: (o, v) => { o.x2 = v; }, y2: (o, v) => { o.y2 = nv(v); }, xy1: (o, x, y) => { o.x1 = x; o.y1 = nv(y); }, xy2: (o, x, y) => { o.x2 = x; o.y2 = nv(y); }, color: (o, v, _, ctx) => { o.ci = pal(ctx, v); }, width: (o, v) => { o.w = v; }, style: ST(0, 'style'), extend: (o, v) => { o.extend = String(v); }});
setters('box', {xloc: (o, v) => { o.xloc = String(v); }, border_style: (o, v) => { o.bstyle = String(v).replace(/^style_/, ''); }, text_size: (o, v) => { o.tz = boxTxt(v); }, text_halign: (o, v) => { o.th = boxTxt(v); }, text_valign: (o, v) => { o.tv = boxTxt(v); }, text_wrap: () => {}, text_font_family: () => {}, left: (o, v) => { o.l = v; }, right: (o, v) => { o.r = v; }, top: (o, v) => { o.t = nv(v); }, bottom: (o, v) => { o.b = nv(v); }, lefttop: (o, l, t) => { o.l = l; o.t = nv(t); }, rightbottom: (o, r, b) => { o.r = r; o.b = nv(b); }, bgcolor: (o, v, _, ctx) => { o.fci = pal(ctx, v); }, border_color: (o, v, _, ctx) => { o.bci = pal(ctx, v); }, border_width: (o, v) => { o.bw = v; }, extend: (o, v) => { o.extend = String(v); }, text: (o, v) => { o.text = String(v); }, text_color: (o, v, _, ctx) => { o.tci = pal(ctx, v); }});
const getter = (kind, p, name) => def(`${kind}.get_${name || p}`, ['id'], a => a[0] && a[0]._kind === kind && a[0][p] !== undefined ? a[0][p] : null);
['x', 'y', 'text'].forEach(p => getter('label', p)); [['x1'], ['y1'], ['x2'], ['y2']].forEach(([p]) => getter('line', p));
[['l', 'left'], ['t', 'top'], ['r', 'right'], ['b', 'bottom']].forEach(([p, n]) => getter('box', p, n));
def('line.get_price', ['id', 'x'], a => { const o = a[0]; if (!o || o.x2 === o.x1 || isna(a[1])) return null; return o.y1 + (o.y2 - o.y1) * (a[1] - o.x1) / (o.x2 - o.x1); });

/* matrix */
const mx = (a, line) => { if (!a || a._kind !== 'matrix') throw new PineError('Se esperaba una matrix', line); return a; };
const MAXM = 250000;
def('matrix.new', ['rows', 'columns', 'initial_value'], (a, c) => { const r = Math.max(0, a[0] | 0), cc = Math.max(0, a[1] | 0); if (r * cc > MAXM) throw new PineError('Matrix demasiado grande', c.line); return {_kind: 'matrix', r, c: cc, d: Array.from({length: r}, () => new Array(cc).fill(a[2] === undefined ? null : a[2]))}; }, {lenient: true});
def('matrix.rows', ['id'], (a, c) => mx(a[0], c.line).r); def('matrix.columns', ['id'], (a, c) => mx(a[0], c.line).c); def('matrix.elements_count', ['id'], (a, c) => mx(a[0], c.line).r * a[0].c);
const mchk = (m, i, j, line) => { if (!Number.isInteger(i) || !Number.isInteger(j) || i < 0 || j < 0 || i >= m.r || j >= m.c) throw new PineError(`Índice fuera de la matrix (${i}, ${j}) en una de ${m.r}×${m.c}`, line); };
def('matrix.get', ['id', 'row', 'column'], (a, c) => { const m = mx(a[0], c.line); mchk(m, a[1], a[2], c.line); return m.d[a[1]][a[2]]; });
def('matrix.set', ['id', 'row', 'column', 'value'], (a, c) => { const m = mx(a[0], c.line); mchk(m, a[1], a[2], c.line); m.d[a[1]][a[2]] = a[3] === undefined ? null : a[3]; return null; });
def('matrix.fill', ['id', 'value'], (a, c) => { const m = mx(a[0], c.line); for (const r of m.d) r.fill(a[1]); return null; });
def('matrix.copy', ['id'], (a, c) => { const m = mx(a[0], c.line); return {_kind: 'matrix', r: m.r, c: m.c, d: m.d.map(r => r.slice())}; });
def('matrix.add_row', ['id', 'row', 'array_id'], (a, c) => { const m = mx(a[0], c.line), at = a[1] === undefined || a[1] === null ? m.r : a[1], src = Array.isArray(a[2]) ? a[2] : []; if (m.c === 0 && !src.length) { m.r++; m.d.splice(at, 0, []); return null; } if (m.r * (m.c || src.length) > MAXM) throw new PineError('Matrix demasiado grande', c.line); if (m.r === 0) m.c = src.length; m.d.splice(at, 0, Array.from({length: m.c}, (_, j) => src[j] === undefined ? null : src[j])); m.r++; return null; });
def('matrix.add_col', ['id', 'column', 'array_id'], (a, c) => { const m = mx(a[0], c.line), at = a[1] === undefined || a[1] === null ? m.c : a[1], src = Array.isArray(a[2]) ? a[2] : []; if (m.r === 0) { m.r = src.length; m.d = Array.from({length: m.r}, () => []); } if (m.r * (m.c + 1) > MAXM) throw new PineError('Matrix demasiado grande', c.line); m.d.forEach((r, i) => r.splice(at, 0, src[i] === undefined ? null : src[i])); m.c++; return null; });
def('matrix.remove_row', ['id', 'row'], (a, c) => { const m = mx(a[0], c.line), i = a[1] === undefined ? m.r - 1 : a[1]; if (i < 0 || i >= m.r) throw new PineError('Fila fuera de la matrix', c.line); const r = m.d.splice(i, 1)[0]; m.r--; return r; });
def('matrix.remove_col', ['id', 'column'], (a, c) => { const m = mx(a[0], c.line), j = a[1] === undefined ? m.c - 1 : a[1]; if (j < 0 || j >= m.c) throw new PineError('Columna fuera de la matrix', c.line); const col = m.d.map(r => r.splice(j, 1)[0]); m.c--; return col; });
def('matrix.row', ['id', 'row'], (a, c) => { const m = mx(a[0], c.line); mchk(m, a[1], 0, c.line); return m.d[a[1]].slice(); });
def('matrix.col', ['id', 'column'], (a, c) => { const m = mx(a[0], c.line); mchk(m, 0, a[1], c.line); return m.d.map(r => r[a[1]]); });
def('matrix.transpose', ['id'], (a, c) => { const m = mx(a[0], c.line); return {_kind: 'matrix', r: m.c, c: m.r, d: Array.from({length: m.c}, (_, j) => m.d.map(r => r[j]))}; });
def('matrix.mult', ['id1', 'id2'], (a, c) => { const m = mx(a[0], c.line), o = a[1]; if (Array.isArray(o)) { if (o.length !== m.c) throw new PineError('Dimensiones incompatibles en matrix.mult', c.line); return m.d.map(r => r.reduce((s, v, j) => s + v * o[j], 0)); } if (typeof o === 'number') return {_kind: 'matrix', r: m.r, c: m.c, d: m.d.map(r => r.map(v => v * o))}; mx(o, c.line); if (o.r !== m.c) throw new PineError('Dimensiones incompatibles en matrix.mult', c.line); return {_kind: 'matrix', r: m.r, c: o.c, d: Array.from({length: m.r}, (_, i) => Array.from({length: o.c}, (_, j) => { let s = 0; for (let k = 0; k < m.c; k++) s += m.d[i][k] * o.d[k][j]; return s; }))}; });
def('matrix.sum', ['id1', 'id2'], (a, c) => { const m = mx(a[0], c.line), o = a[1]; const g = (i, j) => typeof o === 'number' ? o : mx(o, c.line).d[i][j]; return {_kind: 'matrix', r: m.r, c: m.c, d: m.d.map((r, i) => r.map((v, j) => v + g(i, j)))}; });
def('matrix.diff', ['id1', 'id2'], (a, c) => { const m = mx(a[0], c.line), o = a[1]; const g = (i, j) => typeof o === 'number' ? o : mx(o, c.line).d[i][j]; return {_kind: 'matrix', r: m.r, c: m.c, d: m.d.map((r, i) => r.map((v, j) => v - g(i, j)))}; });
const mflat = (a, c) => mx(a[0], c.line).d.flat().filter(v => typeof v === 'number' && !isNaN(v));
def('matrix.avg', ['id'], (a, c) => { const f = mflat(a, c); return f.length ? f.reduce((x, y) => x + y, 0) / f.length : null; });
def('matrix.max', ['id'], (a, c) => { const f = mflat(a, c); return f.length ? Math.max(...f) : null; });
def('matrix.min', ['id'], (a, c) => { const f = mflat(a, c); return f.length ? Math.min(...f) : null; });
def('matrix.is_square', ['id'], (a, c) => mx(a[0], c.line).r === a[0].c);
def('matrix.swap_rows', ['id', 'row1', 'row2'], (a, c) => { const m = mx(a[0], c.line); mchk(m, a[1], 0, c.line); mchk(m, a[2], 0, c.line); [m.d[a[1]], m.d[a[2]]] = [m.d[a[2]], m.d[a[1]]]; return null; });
def('matrix.det', ['id'], (a, c) => { const m = mx(a[0], c.line); if (m.r !== m.c) throw new PineError('matrix.det necesita una matrix cuadrada', c.line); const d = m.d.map(r => r.slice()), n = m.r; let det = 1; for (let i = 0; i < n; i++) { let p = i; for (let k = i + 1; k < n; k++) if (Math.abs(d[k][i]) > Math.abs(d[p][i])) p = k; if (d[p][i] === 0) return 0; if (p !== i) { [d[p], d[i]] = [d[i], d[p]]; det = -det; } det *= d[i][i]; for (let k = i + 1; k < n; k++) { const f = d[k][i] / d[i][i]; for (let j = i; j < n; j++) d[k][j] -= f * d[i][j]; } } return det; });

/* conversiones y tiempo */
def('int', ['x'], a => isna(a[0]) ? null : Math.trunc(+a[0]));
def('float', ['x'], a => isna(a[0]) ? null : +a[0]);
def('bool', ['x'], a => isna(a[0]) ? false : !!a[0]);
def('string', ['x'], a => isna(a[0]) ? null : String(a[0]));
def('color', ['x'], a => a[0] instanceof Col ? a[0] : null);
def('timestamp', ['a', 'b', 'c', 'd', 'e', 'f', 'g'], a => {
  let v = a.slice(); if (typeof v[0] === 'string' && v.length > 1 && typeof v[1] === 'number' && /^(UTC|GMT)/i.test(v[0])) v.shift();
  if (typeof v[0] === 'string') { const t = Date.parse(/[zZ]|[+-]\d\d:?\d\d$|GMT|UTC/.test(v[0]) ? v[0] : v[0].replace(' ', 'T') + (v[0].length > 10 ? 'Z' : 'T00:00:00Z')); return isNaN(t) ? null : t; }
  const [y, mo, d, h, mi, se] = v.map(x => isna(x) ? 0 : x); if (!y) return null;
  return Date.UTC(y, (mo || 1) - 1, d || 1, h || 0, mi || 0, se || 0);
});

/* chart.point / polyline / table */
const num0 = v => isna(v) ? null : v;
def('chart.point.from_index', ['index', 'price'], a => ({_kind: 'point', i: num0(a[0]), t: null, p: num0(a[1])}));
def('chart.point.from_time', ['time', 'price'], a => ({_kind: 'point', i: null, t: num0(a[0]), p: num0(a[1])}));
def('chart.point.new', ['time', 'index', 'price'], a => ({_kind: 'point', i: num0(a[1]), t: num0(a[0]), p: num0(a[2])}));
def('chart.point.now', ['price'], (a, c) => ({_kind: 'point', i: c.ctx.bar, t: c.ctx.candles[c.ctx.bar].t, p: num0(a[0])}));
def('polyline.new', ['points', 'curved', 'closed', 'xloc', 'line_color', 'fill_color', 'line_style', 'line_width', 'force_overlay'], (a, c) => {
  const ctx = c.ctx, pts = Array.isArray(a[0]) ? a[0].filter(q => q && q._kind === 'point').map(q => Object.assign({}, q)) : [];
  const o = {_kind: 'polyline', pts, closed: a[2] === true, xloc: String(a[3] || 'bar_index'), lci: dcol(ctx, a[4], DEFCOL), fci: a[5] instanceof Col ? pal(ctx, a[5]) : null, style: String(a[6] || 'style_solid').replace(/^style_/, ''), w: a[7] || 1};
  keepLimit(ctx, ctx.out.polylines, o, ctx.out.meta.maxPolylines || 50); return o;
}, {lenient: true});
def('polyline.delete', ['id'], a => { if (a[0] && a[0]._kind === 'polyline') a[0].deleted = true; return null; });
for (const [k, list] of [['label', 'labels'], ['line', 'lines'], ['box', 'boxes'], ['polyline', 'polylines'], ['table', 'tables']]) CONST_DYN[k + '.all'] = ctx => ctx.out[list].filter(o => !o.deleted);
def('table.new', ['position', 'columns', 'rows', 'bgcolor', 'frame_color', 'frame_width', 'border_color', 'border_width'], (a, c) => {
  const ctx = c.ctx, o = {_kind: 'table', pos: String(a[0] || 'top_right').replace(/^position\./, ''), cols: a[1] || 1, rows: a[2] || 1, bci: a[3] instanceof Col ? pal(ctx, a[3]) : null, frame: a[4] instanceof Col ? pal(ctx, a[4]) : null, fw: a[5] || 0, border: a[6] instanceof Col ? pal(ctx, a[6]) : null, bw: a[7] || 0, cells: new Map()};
  ctx.out.tables.push(o); if (ctx.out.tables.filter(t => !t.deleted).length > 9) { const f = ctx.out.tables.find(t => !t.deleted); f.deleted = true; } return o;
}, {lenient: true});
def('table.cell', ['table_id', 'column', 'row', 'text', 'width', 'height', 'text_color', 'text_halign', 'text_valign', 'text_size', 'bgcolor', 'tooltip', 'text_font_family', 'text_formatting'], (a, c) => {
  const t = a[0], ctx = c.ctx; if (!t || t._kind !== 'table') return null;
  const key = a[1] + ',' + a[2]; let cell = t.cells.get(key); if (!cell) { cell = {c: a[1], r: a[2]}; t.cells.set(key, cell); }
  if (a[3] !== undefined) cell.text = String(a[3]); if (a[6] instanceof Col) cell.tci = pal(ctx, a[6]); if (a[7] !== undefined) cell.halign = String(a[7]); if (a[9] !== undefined) cell.size = String(a[9]); if (a[10] instanceof Col) cell.bci = pal(ctx, a[10]);
  return null;
}, {lenient: true});
const tcell = (name, apply) => def('table.cell_set_' + name, ['table_id', 'column', 'row', 'value'], (a, c) => { const t = a[0]; if (!t || t._kind !== 'table') return null; const key = a[1] + ',' + a[2]; let cell = t.cells.get(key); if (!cell) { cell = {c: a[1], r: a[2]}; t.cells.set(key, cell); } apply(cell, a[3], c.ctx); return null; }, {lenient: true});
tcell('text', (cell, v) => { cell.text = String(v); }); tcell('bgcolor', (cell, v, ctx) => { cell.bci = pal(ctx, v); }); tcell('text_color', (cell, v, ctx) => { cell.tci = pal(ctx, v); }); tcell('text_size', (cell, v) => { cell.size = String(v); }); tcell('text_halign', (cell, v) => { cell.halign = String(v); });
for (const nm of ['bgcolor', 'position', 'frame_color', 'frame_width', 'border_color', 'border_width']) def('table.set_' + nm, ['table_id', 'value'], (a, c) => { const t = a[0]; if (!t || t._kind !== 'table') return null; if (nm === 'position') t.pos = String(a[1]); else if (nm === 'bgcolor') t.bci = pal(c.ctx, a[1]); else if (nm === 'frame_color') t.frame = pal(c.ctx, a[1]); else if (nm === 'border_color') t.border = pal(c.ctx, a[1]); else if (nm === 'frame_width') t.fw = a[1]; else t.bw = a[1]; return null; }, {lenient: true});
def('table.delete', ['table_id'], a => { if (a[0] && a[0]._kind === 'table') a[0].deleted = true; return null; });
def('table.clear', ['table_id', 'start_column', 'start_row', 'end_column', 'end_row'], a => { const t = a[0]; if (!t || t._kind !== 'table') return null; const [c0, r0, c1, r1] = [a[1] ?? 0, a[2] ?? 0, a[3] ?? t.cols, a[4] ?? t.rows]; for (const [k, cell] of [...t.cells]) if (cell.c >= c0 && cell.c <= c1 && cell.r >= r0 && cell.r <= r1) t.cells.delete(k); return null; });
for (const nm of ['merge_cells', 'cell_set_width', 'cell_set_height', 'cell_set_tooltip', 'cell_set_text_valign', 'cell_set_text_font_family']) def('table.' + nm, null, () => null, {lenient: true});

/* ───────────── Análisis estático y ejecución ───────────── */
function walk(n, f) {
  if (Array.isArray(n)) { for (const x of n) walk(x, f); return; }
  if (!n || typeof n !== 'object' || n instanceof Col) return;
  if (n.k) f(n);
  for (const key in n) { const v = n[key]; if (v && typeof v === 'object') walk(v, f); }
}

/* ───────── Funciones agregadas para compatibilidad amplia (v5/v6) ───────── */
// datos de bolsa que no existen en cripto: devuelven na sin detener el script (solo un aviso informativo)
for (const nm of ['request.financial', 'request.earnings', 'request.dividends', 'request.splits', 'request.economic', 'request.quandl', 'request.seed'])
  def(nm, null, (a, c) => { warn(c.ctx, c.line, `${nm}() da datos de acciones (balances, dividendos, economía…) que no existen para criptomonedas: devuelve na`, 'na:' + nm, 'info'); return null; }, {lenient: true});
def('request.currency_rate', ['from', 'to', 'ignore_invalid_currency'], a => { const f = String(a[0] || '').toUpperCase(), t = String(a[1] || '').toUpperCase(), usd = x => /^(USD|USDT|USDC)$/.test(x); return f === t || (usd(f) && usd(t)) ? 1 : null; });
// tickers especiales: se usa el mismo símbolo (las velas son las normales)
for (const k of ['renko', 'kagi', 'linebreak', 'pointfigure', 'inherit', 'standard']) def('ticker.' + k, ['symbol'], (a, c) => { if (k !== 'standard' && k !== 'inherit') warn(c.ctx, c.line, `ticker.${k}() usa las velas normales (no hay ${k} aquí)`, 'tk:' + k, 'fix'); return isna(a[0]) ? c.ctx.symbol : String(a[0]); }, {lenient: true});
def('syminfo.ticker', ['symbol'], (a, c) => { const s = isna(a[0]) ? c.ctx.symbol : String(a[0]); return s.includes(':') ? s.split(':')[1] : s; });
def('syminfo.prefix', ['symbol'], (a, c) => { const s = isna(a[0]) ? '' : String(a[0]); return s.includes(':') ? s.split(':')[0] : (SEC_NAME[c.ctx.exch] || 'BINANCE'); });
CONSTS['timeframe.main_period'] = c => tfPeriod(c.interval);
// arrays
def('array.every', ['id'], (a, c) => arrOf(a[0], c.line).every(x => !isna(x) && truthy(x)));
def('array.some', ['id'], (a, c) => arrOf(a[0], c.line).some(x => !isna(x) && truthy(x)));
// chart.point / box con puntos
def('chart.point.copy', ['id'], a => a[0] && a[0]._kind === 'point' ? Object.assign({}, a[0]) : null);
def('box.set_top_left_point', ['id', 'point'], a => { const o = a[0], p = a[1]; if (o && o._kind === 'box' && p && p._kind === 'point') { o.l = p.i !== null ? p.i : p.t; o.t = p.p; } return null; });
def('box.set_bottom_right_point', ['id', 'point'], a => { const o = a[0], p = a[1]; if (o && o._kind === 'box' && p && p._kind === 'point') { o.r = p.i !== null ? p.i : p.t; o.b = p.p; } return null; });
for (const k of ['label.set_text_formatting', 'box.set_text_formatting', 'table.cell_set_text_formatting', 'label.set_text_font_family', 'table.cell_set_text_font_family']) def(k, null, () => null, {lenient: true});
// ta.rci: índice de correlación por rangos (Spearman entre el orden del tiempo y el del precio), de -100 a 100
def('ta.rci', S1, (a, c) => { const len = LEN(a[1]), b = pushV(c.st, c.ctx.bar, a[0]); if (b.length < len) return null; const w = b.slice(-len); if (w.some(isna)) return null;
  const idx = w.map((v, i) => i), byP = [...idx].sort((x, y) => w[y] - w[x]), rank = new Array(len); byP.forEach((i, r) => { rank[i] = r + 1; });
  let d = 0; for (let i = 0; i < len; i++) { const tr = len - i; d += (tr - rank[i]) ** 2; } return (1 - 6 * d / (len * (len * len - 1))) * 100; });
// ta.pivot_point_levels(type, anchor, developing): niveles del periodo anterior → [P, R1, S1, R2, S2, R3, S3, R4, S4, R5, S5]
def('ta.pivot_point_levels', ['type', 'anchor', 'developing'], (a, c) => {
  const st = c.st, k = c.ctx.candles[c.ctx.bar], type = String(a[0] || 'Traditional').toLowerCase();
  if (st.bar !== c.ctx.bar) { st.bar = c.ctx.bar;
    if (truthy(a[1]) && st.h != null) { st.prev = {h: st.h, l: st.l, c: st.c, o: st.o}; st.h = null; }
    if (st.h == null) { st.h = k.h; st.l = k.l; st.o = k.o; } else { st.h = Math.max(st.h, k.h); st.l = Math.min(st.l, k.l); } st.c = k.c; }
  const p = truthy(a[2]) ? {h: st.h, l: st.l, c: st.c, o: st.o} : st.prev; if (!p) return new Array(11).fill(null);
  const {h, l} = p, cl = p.c, r = h - l; let P = (h + l + cl) / 3, L = [];
  switch (type) {
    case 'fibonacci': L = [P + .382 * r, P - .382 * r, P + .618 * r, P - .618 * r, P + r, P - r, null, null, null, null]; break;
    case 'woodie': P = (h + l + 2 * cl) / 4; L = [2 * P - l, 2 * P - h, P + r, P - r, h + 2 * (P - l), l - 2 * (h - P), null, null, null, null]; L[6] = L[4] + r; L[7] = L[5] - r; break;
    case 'classic': L = [2 * P - l, 2 * P - h, P + r, P - r, P + 2 * r, P - 2 * r, P + 3 * r, P - 3 * r, null, null]; break;
    case 'dm': { const x = cl < p.o ? h + 2 * l + cl : cl > p.o ? 2 * h + l + cl : h + l + 2 * cl; P = x / 4; L = [x / 2 - l, x / 2 - h, null, null, null, null, null, null, null, null]; break; }
    case 'camarilla': L = [cl + r * 1.1 / 12, cl - r * 1.1 / 12, cl + r * 1.1 / 6, cl - r * 1.1 / 6, cl + r * 1.1 / 4, cl - r * 1.1 / 4, cl + r * 1.1 / 2, cl - r * 1.1 / 2, null, null]; L[8] = (h / l) * cl; L[9] = cl - (L[8] - cl); break;
    default: L = [2 * P - l, 2 * P - h, P + r, P - r, 2 * P + (h - 2 * l), 2 * P - (2 * h - l), 3 * P + (h - 3 * l), 3 * P - (3 * h - l), 4 * P + (h - 4 * l), 4 * P - (4 * h - l)];
  }
  return [P, ...L];
});
// matrix: más operaciones
const mget = (m, i, j) => m.d[i][j];
const mnew = (r, cc, f) => ({_kind: 'matrix', r, c: cc, d: Array.from({length: r}, (_, i) => Array.from({length: cc}, (_, j) => f(i, j)))});
def('matrix.submatrix', ['id', 'from_row', 'to_row', 'from_column', 'to_column'], (a, c) => { const m = mx(a[0], c.line), r0 = a[1] | 0 || 0, r1 = isna(a[2]) ? m.r : a[2] | 0, c0 = a[3] | 0 || 0, c1 = isna(a[4]) ? m.c : a[4] | 0; return mnew(Math.max(0, r1 - r0), Math.max(0, c1 - c0), (i, j) => mget(m, r0 + i, c0 + j)); });
def('matrix.reverse', ['id'], (a, c) => { const m = mx(a[0], c.line); m.d.reverse(); m.d.forEach(r => r.reverse()); return null; });
def('matrix.trace', ['id'], (a, c) => { const m = mx(a[0], c.line); let t = 0; for (let i = 0; i < Math.min(m.r, m.c); i++) t += m.d[i][i] || 0; return t; });
def('matrix.swap_columns', ['id', 'column1', 'column2'], (a, c) => { const m = mx(a[0], c.line); for (const r of m.d) { const t = r[a[1]]; r[a[1]] = r[a[2]]; r[a[2]] = t; } return null; });
def('matrix.reshape', ['id', 'rows', 'columns'], (a, c) => { const m = mx(a[0], c.line), flat = m.d.flat(), r = a[1] | 0, cc = a[2] | 0; m.r = r; m.c = cc; m.d = Array.from({length: r}, (_, i) => flat.slice(i * cc, i * cc + cc)); return null; });
def('matrix.concat', ['id1', 'id2'], (a, c) => { const m = mx(a[0], c.line), n = mx(a[1], c.line); for (const r of n.d) m.d.push(r.slice()); m.r = m.d.length; return m; });
def('matrix.median', ['id'], (a, c) => { const v = mx(a[0], c.line).d.flat().filter(x => !isna(x)).sort((x, y) => x - y); if (!v.length) return null; const h = v.length >> 1; return v.length % 2 ? v[h] : (v[h - 1] + v[h]) / 2; });
def('matrix.mode', ['id'], (a, c) => { const cnt = new Map(); for (const x of mx(a[0], c.line).d.flat()) if (!isna(x)) cnt.set(x, (cnt.get(x) || 0) + 1); let best = null, n = 0; for (const [k, v] of cnt) if (v > n || (v === n && k < best)) { best = k; n = v; } return best; });
def('matrix.sort', ['id', 'column', 'order'], (a, c) => { const m = mx(a[0], c.line), col = a[1] | 0, desc = String(a[2] || '').includes('desc'); m.d.sort((x, y) => desc ? y[col] - x[col] : x[col] - y[col]); return null; });
def('matrix.kron', ['id1', 'id2'], (a, c) => { const A = mx(a[0], c.line), Bm = mx(a[1], c.line); return mnew(A.r * Bm.r, A.c * Bm.c, (i, j) => A.d[Math.floor(i / Bm.r)][Math.floor(j / Bm.c)] * Bm.d[i % Bm.r][j % Bm.c]); });
function matInv(m) { const n = m.r; if (n !== m.c) return null; const A = m.d.map((r, i) => [...r, ...Array.from({length: n}, (_, j) => +(i === j))]);
  for (let i = 0; i < n; i++) { let p = i; for (let k = i + 1; k < n; k++) if (Math.abs(A[k][i]) > Math.abs(A[p][i])) p = k; if (Math.abs(A[p][i]) < 1e-12) return null; [A[i], A[p]] = [A[p], A[i]]; const d = A[i][i]; for (let j = 0; j < 2 * n; j++) A[i][j] /= d; for (let k = 0; k < n; k++) if (k !== i) { const f = A[k][i]; for (let j = 0; j < 2 * n; j++) A[k][j] -= f * A[i][j]; } }
  return mnew(n, n, (i, j) => A[i][n + j]); }
if (!B['matrix.inv']) def('matrix.inv', ['id'], (a, c) => matInv(mx(a[0], c.line)));
def('matrix.pinv', ['id'], (a, c) => { const m = mx(a[0], c.line), T = mnew(m.c, m.r, (i, j) => m.d[j][i]), TT = mnew(m.c, m.c, (i, j) => { let s = 0; for (let k = 0; k < m.r; k++) s += m.d[k][i] * m.d[k][j]; return s; }), I = matInv(TT); if (!I) return null; return mnew(m.c, m.r, (i, j) => { let s = 0; for (let k = 0; k < m.c; k++) s += I.d[i][k] * T.d[k][j]; return s; }); });
def('matrix.pow', ['id', 'power'], (a, c) => { let m = mx(a[0], c.line), r = mnew(m.r, m.c, (i, j) => +(i === j)); for (let p = 0; p < (a[1] | 0); p++) r = mnew(m.r, m.c, (i, j) => { let s = 0; for (let k = 0; k < m.c; k++) s += r.d[i][k] * m.d[k][j]; return s; }); return r; });
def('matrix.rank', ['id'], (a, c) => { const m = mx(a[0], c.line), A = m.d.map(r => r.slice()); let rank = 0; const rows = m.r, cols = m.c;
  for (let col = 0; col < cols && rank < rows; col++) { let p = rank; for (let k = rank + 1; k < rows; k++) if (Math.abs(A[k][col]) > Math.abs(A[p][col])) p = k; if (Math.abs(A[p][col]) < 1e-10) continue; [A[rank], A[p]] = [A[p], A[rank]]; for (let k = rank + 1; k < rows; k++) { const f = A[k][col] / A[rank][col]; for (let j = col; j < cols; j++) A[k][j] -= f * A[rank][j]; } rank++; } return rank; });
const mIs = (nm, f) => def('matrix.' + nm, ['id'], (a, c) => { const m = mx(a[0], c.line); return f(m); });
mIs('is_square', m => m.r === m.c); mIs('is_zero', m => m.d.every(r => r.every(x => x === 0))); mIs('is_binary', m => m.d.every(r => r.every(x => x === 0 || x === 1)));
mIs('is_diagonal', m => m.r === m.c && m.d.every((r, i) => r.every((x, j) => i === j || x === 0))); mIs('is_antidiagonal', m => m.r === m.c && m.d.every((r, i) => r.every((x, j) => i + j === m.c - 1 || x === 0)));
mIs('is_identity', m => m.r === m.c && m.d.every((r, i) => r.every((x, j) => x === +(i === j)))); mIs('is_symmetric', m => m.r === m.c && m.d.every((r, i) => r.every((x, j) => x === m.d[j][i])));
mIs('is_antisymmetric', m => m.r === m.c && m.d.every((r, i) => r.every((x, j) => x === -m.d[j][i]))); mIs('is_triangular', m => m.r === m.c && (m.d.every((r, i) => r.every((x, j) => j <= i || x === 0)) || m.d.every((r, i) => r.every((x, j) => j >= i || x === 0))));
mIs('is_stochastic', m => m.d.every(r => r.every(x => x >= 0) && Math.abs(r.reduce((s, x) => s + x, 0) - 1) < 1e-9));
mIs('eigenvalues', m => { // simétricas (Jacobi); otras: aproximación con la parte simétrica
  const n = m.r, A = m.d.map((r, i) => r.map((x, j) => (x + m.d[j][i]) / 2)); for (let it = 0; it < 60 * n * n; it++) { let p = 0, q = 1, mxv = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (Math.abs(A[i][j]) > mxv) { mxv = Math.abs(A[i][j]); p = i; q = j; } if (mxv < 1e-12) break;
    const th = (A[q][q] - A[p][p]) / (2 * A[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), cs = 1 / Math.sqrt(t * t + 1), sn = t * cs;
    for (let k = 0; k < n; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = cs * akp - sn * akq; A[k][q] = sn * akp + cs * akq; } for (let k = 0; k < n; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = cs * apk - sn * aqk; A[q][k] = sn * apk + cs * aqk; } }
  return A.map((r, i) => r[i]); });
// request.footprint (Pine v6): perfil de volumen de la vela, aproximado con la propia vela (compra = parte del volumen según dónde cerró)
function fpBuild(ctx, ticks, va) {
  const k = ctx.candles[ctx.bar], tick = (ctx.mintick || 0.01) * Math.max(1, ticks | 0 || 100), lo = Math.floor(k.l / tick) * tick, n = Math.max(1, Math.min(200, Math.ceil((k.h - lo) / tick) || 1)), rows = [];
  const buyFrac = k.h > k.l ? (k.c - k.l) / (k.h - k.l) : 0.5;
  for (let i = 0; i < n; i++) { const dn = lo + i * tick, up = dn + tick, mid = (dn + up) / 2, w = 1 / n, tv = k.v * w, bv = tv * (mid <= k.c ? Math.min(1, buyFrac + .25) : Math.max(0, buyFrac - .25)); rows.push({_kind: 'volume_row', up, dn, bv, sv: tv - bv}); }
  let poc = rows[0]; for (const r of rows) if (r.bv + r.sv > poc.bv + poc.sv) poc = r;
  const tot = rows.reduce((s, r) => s + r.bv + r.sv, 0), pi = rows.indexOf(poc); let lo2 = pi, hi2 = pi, acc = poc.bv + poc.sv;
  while (acc < tot * (va || 70) / 100 && (lo2 > 0 || hi2 < rows.length - 1)) { const a2 = lo2 > 0 ? rows[lo2 - 1].bv + rows[lo2 - 1].sv : -1, b2 = hi2 < rows.length - 1 ? rows[hi2 + 1].bv + rows[hi2 + 1].sv : -1; if (b2 >= a2) { hi2++; acc += b2; } else { lo2--; acc += a2; } }
  return {_kind: 'footprint', rows, poc, vah: rows[hi2], val: rows[lo2]};
}
def('request.footprint', ['ticks_per_row', 'va_percent', 'imbalance_percent'], (a, c) => { warn(c.ctx, c.line, 'request.footprint() se aproxima con la vela (sin datos tick a tick)', 'fp', 'fix'); return fpBuild(c.ctx, a[0], a[1]); });
const fpOf = (a) => a[0] && a[0]._kind === 'footprint' ? a[0] : null;
def('footprint.buy_volume', ['id'], a => { const f = fpOf(a); return f ? f.rows.reduce((s, r) => s + r.bv, 0) : null; });
def('footprint.sell_volume', ['id'], a => { const f = fpOf(a); return f ? f.rows.reduce((s, r) => s + r.sv, 0) : null; });
def('footprint.total_volume', ['id'], a => { const f = fpOf(a); return f ? f.rows.reduce((s, r) => s + r.bv + r.sv, 0) : null; });
def('footprint.delta', ['id'], a => { const f = fpOf(a); return f ? f.rows.reduce((s, r) => s + r.bv - r.sv, 0) : null; });
def('footprint.poc', ['id'], a => { const f = fpOf(a); return f ? f.poc : null; }); def('footprint.vah', ['id'], a => { const f = fpOf(a); return f ? f.vah : null; }); def('footprint.val', ['id'], a => { const f = fpOf(a); return f ? f.val : null; });
def('footprint.rows', ['id'], a => { const f = fpOf(a); return f ? f.rows.slice() : []; });
def('footprint.get_row_by_price', ['id', 'price'], a => { const f = fpOf(a); return f ? f.rows.find(r => a[1] >= r.dn && a[1] < r.up) || null : null; });
const vrOf = a => a[0] && a[0]._kind === 'volume_row' ? a[0] : null;
def('volume_row.up_price', ['id'], a => { const r = vrOf(a); return r ? r.up : null; }); def('volume_row.down_price', ['id'], a => { const r = vrOf(a); return r ? r.dn : null; });
def('volume_row.buy_volume', ['id'], a => { const r = vrOf(a); return r ? r.bv : null; }); def('volume_row.sell_volume', ['id'], a => { const r = vrOf(a); return r ? r.sv : null; });
def('volume_row.total_volume', ['id'], a => { const r = vrOf(a); return r ? r.bv + r.sv : null; }); def('volume_row.delta', ['id'], a => { const r = vrOf(a); return r ? r.bv - r.sv : null; });
def('volume_row.has_buy_imbalance', ['id'], a => { const r = vrOf(a); return r ? r.bv > r.sv * 3 : null; }); def('volume_row.has_sell_imbalance', ['id'], a => { const r = vrOf(a); return r ? r.sv > r.bv * 3 : null; });

/* Bibliotecas de TradingView incluidas en VORTEX, escritas en Pine (se cargan con «import Autor/Biblioteca/N as alias»).
   Las funciones que ya existen en ta.* se resuelven solas; aquí van las que la biblioteca agrega. */
const LIBS = Object.create(null);
LIBS['TradingView/ta'] = `
dema(float source, simple int length) =>
    float e1 = ta.ema(source, length)
    float e2 = ta.ema(e1, length)
    2 * e1 - e2
dema2(float source, int length) => LIB.dema(source, length)
tema(float source, simple int length) =>
    float e1 = ta.ema(source, length)
    float e2 = ta.ema(e1, length)
    float e3 = ta.ema(e2, length)
    3 * e1 - 3 * e2 + e3
tema2(float source, int length) => LIB.tema(source, length)
ema2(float source, int length) => ta.ema(source, length)
sma2(float source, int length) => ta.sma(source, length)
rma2(float source, int length) => ta.rma(source, length)
wma2(float source, int length) => ta.wma(source, length)
atr2(int length) => ta.atr(length)
rsi2(float source, int length) => ta.rsi(source, length)
t3(float source, simple int length, float vf = 0.7) =>
    float e1 = ta.ema(source, length)
    float e2 = ta.ema(e1, length)
    float e3 = ta.ema(e2, length)
    float e4 = ta.ema(e3, length)
    float e5 = ta.ema(e4, length)
    float e6 = ta.ema(e5, length)
    float c1 = -vf * vf * vf
    float c2 = 3 * vf * vf + 3 * vf * vf * vf
    float c3 = -6 * vf * vf - 3 * vf - 3 * vf * vf * vf
    float c4 = 1 + 3 * vf + vf * vf * vf + 3 * vf * vf
    c1 * e6 + c2 * e5 + c3 * e4 + c4 * e3
t3Alt(float source, simple int length, float vf = 0.7) => LIB.t3(source, length, vf)
trima(float source, simple int length) => ta.sma(ta.sma(source, math.ceil(length / 2)), math.floor(length / 2) + 1)
trima2(float source, int length) => LIB.trima(source, length)
frama(float source, simple int length) =>
    int half = math.max(1, math.floor(length / 2))
    float n3 = (ta.highest(high, length) - ta.lowest(low, length)) / length
    float n2 = (ta.highest(high, half) - ta.lowest(low, half)) / half
    float n1 = (ta.highest(high, half)[half] - ta.lowest(low, half)[half]) / half
    float dimen = n1 > 0 and n2 > 0 and n3 > 0 ? (math.log(n1 + n2) - math.log(n3)) / math.log(2) : 0
    float alpha = math.min(1.0, math.max(0.01, math.exp(-4.6 * (dimen - 1))))
    var float result = na
    result := na(result) ? source : alpha * source + (1 - alpha) * result
    result
aroon(simple int length) =>
    float up = 100 * (ta.highestbars(high, length + 1) + length) / length
    float dn = 100 * (ta.lowestbars(low, length + 1) + length) / length
    [up, dn]
cagr(int entryTime, float entryPrice, int exitTime, float exitPrice) =>
    float years = (exitTime - entryTime) / (365.25 * 24 * 60 * 60 * 1000)
    years > 0 and entryPrice > 0 ? (math.pow(exitPrice / entryPrice, 1 / years) - 1) * 100 : na
changePercent(float newValue, float oldValue) => oldValue != 0 ? (newValue - oldValue) * 100 / math.abs(oldValue) : na
coppock(float source, simple int length, simple int longRocLength, simple int shortRocLength) => ta.wma(ta.roc(source, longRocLength) + ta.roc(source, shortRocLength), length)
kvo(simple int fastLen, simple int slowLen, simple int trigLen) =>
    float sv = ta.change(hlc3) >= 0 ? volume : -volume
    float k = ta.ema(sv, fastLen) - ta.ema(sv, slowLen)
    [k, ta.ema(k, trigLen)]
trix(float source, simple int length, simple int signalLength = 9, bool exponential = true) =>
    float t = 10000 * ta.change(math.log(ta.ema(ta.ema(ta.ema(source, length), length), length)))
    [t, exponential ? ta.ema(t, signalLength) : ta.sma(t, signalLength), t - (exponential ? ta.ema(t, signalLength) : ta.sma(t, signalLength))]
uo(simple int fastLen, simple int midLen, simple int slowLen) =>
    float bp = close - math.min(low, nz(close[1], close))
    float tr = math.max(high, nz(close[1], close)) - math.min(low, nz(close[1], close))
    float a1 = math.sum(bp, fastLen) / math.sum(tr, fastLen)
    float a2 = math.sum(bp, midLen) / math.sum(tr, midLen)
    float a3 = math.sum(bp, slowLen) / math.sum(tr, slowLen)
    100 * (4 * a1 + 2 * a2 + a3) / 7
szo(float source, simple int length) =>
    float r = source > nz(source[1], source) ? 1.0 : -1.0
    100 * LIB.tema(r, length)
ft(float source, simple int length) =>
    float hi = ta.highest(source, length)
    float lo = ta.lowest(source, length)
    var float value = 0.0
    value := 0.66 * ((source - lo) / math.max(hi - lo, 0.001) - 0.5) + 0.67 * nz(value)
    float v = value > 0.99 ? 0.999 : value < -0.99 ? -0.999 : value
    var float fish = 0.0
    fish := 0.5 * math.log((1 + v) / (1 - v)) + 0.5 * nz(fish)
    fish
ift(float source) => (math.exp(2 * source) - 1) / (math.exp(2 * source) + 1)
ao(float source = hl2, simple int fastLength = 5, simple int slowLength = 34) => ta.sma(source, fastLength) - ta.sma(source, slowLength)
wpo(simple int length) =>
    float wl = ta.sma(close, length)
    wl != 0 ? (close - wl) / wl * 100 : na
relativeVolume(simple int length, simple string anchorTimeframe = "", simple bool isCumulative = true, simple bool adjustRealtime = false) =>
    float past = ta.sma(volume, length)
    [volume, past, past != 0 ? volume / past : na]
requestUpAndDownVolume(simple string lowerTimeframe) =>
    float up = close > open ? volume : close < open ? 0.0 : volume / 2
    float dn = -(volume - up)
    [up, dn, up + dn]
requestVolumeDelta(simple string lowerTimeframe, simple string cumulativePeriod = "", simple bool isCumulative = false) =>
    float up = close > open ? volume : close < open ? 0.0 : volume / 2
    float d = up - (volume - up)
    [0.0, math.max(d, 0.0), math.min(d, 0.0), d]
vStop(float source, simple float atrFactor, simple int atrLength) =>
    float atrM = nz(ta.atr(atrLength) * atrFactor, ta.tr)
    var float stop = na
    var bool trendUp = true
    float mx = na
    float mn = na
    var float smax = source
    var float smin = source
    smax := math.max(smax, source)
    smin := math.min(smin, source)
    stop := nz(trendUp ? math.max(nz(stop, source - atrM), smax - atrM) : math.min(nz(stop, source + atrM), smin + atrM), source)
    bool newUp = source - stop >= 0.0
    if newUp != trendUp
        smax := source
        smin := source
        stop := newUp ? smax - atrM : smin + atrM
    trendUp := newUp
    [stop, trendUp]
`;
const libCache = new Map();
function libAst(name, alias) { const k = name + '|' + alias; if (!libCache.has(k)) libCache.set(k, parse(lex(LIBS[name].replace(/\bLIB\./g, alias + '.'))).filter(x => x.k === 'fn')); return libCache.get(k); }

function analyze(ast, ctx) {
  const declared = new Set();
  for (const st of ast) if (st.k === 'import') {
    (ctx.libs || (ctx.libs = new Map())).set(st.alias, st.lib);
    const src = LIBS[st.lib];
    if (src) { const lib = libAst(st.lib, st.alias); for (const fn of lib) { const f = Object.assign({}, fn, {name: fn.method ? fn.name : st.alias + '.' + fn.name, line: st.line}); ast.push(f); } }
    else warn(ctx, st.line, `La biblioteca «${st.lib}» no está incluida en VORTEX: sus funciones devuelven na (la IA puede reescribirlas dentro del script)`, 'lib:' + st.lib, 'unsupported');
  }
  walk(ast, n => {
    if (n.k === 'decl') declared.add(n.name); else if (n.k === 'tdecl') n.names.forEach(x => declared.add(x));
    else if (n.k === 'for') declared.add(n.v); else if (n.k === 'forin') { declared.add(n.v); if (n.idx) declared.add(n.idx); }
    else if (n.k === 'type') ctx.types.set(n.name, n);
    else if (n.k === 'enum') (ctx.enums || (ctx.enums = new Map())).set(n.name, n);
    else if (n.k === 'fn') { if (n.method) { if (!ctx.methods.has(n.name)) ctx.methods.set(n.name, []); ctx.methods.get(n.name).push(n); } else ctx.fns.set(n.name, n); n.params.forEach(p => declared.add(p.name)); }
  });
  walk(ast, n => {
    if (n.k !== 'call') return;
    const parts = n.fn.k === 'id' ? [n.fn.name] : n.fn.k === 'mem' ? dotted(n.fn) : null;
    if (!parts || declared.has(parts[0])) return;
    const name = parts.join('.');
    if (ctx.fns.has(name) || B[name] || name.startsWith('array.new_') || /^array\.new[a-z]/.test(name) || (parts.length === 2 && parts[1] === 'new' && ctx.types.has(parts[0])) || (parts.length === 1 && ctx.methods.has(name))) return;
    if (parts.length === 1 && (B['ta.' + name] || B['math.' + name] || B['str.' + name] || B[LEGACY[name]])) { const to = B['math.' + name] ? 'math.' + name : B['ta.' + name] ? 'ta.' + name : B['str.' + name] ? 'str.' + name : LEGACY[name]; if (to !== name) (ctx.legacyUsed || (ctx.legacyUsed = new Map())).set(name, to); return; }
    if (parts[0] === 'strategy') { warn(ctx, n.line, 'Las órdenes de «strategy.*» se ignoran: este script solo se muestra como indicador (el backtesting llega en la Fase 7)', 'strategy', 'unsupported'); return; }
    if (ctx.libs && ctx.libs.has(parts[0]) && !LIBS[ctx.libs.get(parts[0])]) return;
    warn(ctx, n.line, `Función no soportada: ${name}() — devuelve na`, 'f:' + name, 'unsupported');
  });
}
function timeToIndex(ctx, t) {
  const cs = ctx.candles, n = cs.length; if (isna(t)) return null;
  if (t <= cs[0].t) return (t - cs[0].t) / ctx.ms;
  if (t >= cs[n - 1].t) return n - 1 + (t - cs[n - 1].t) / ctx.ms;
  let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cs[m].t <= t) lo = m; else hi = m; }
  return lo + (t - cs[lo].t) / (cs[hi].t - cs[lo].t);
}
function uniform(arr) { let u; for (const x of arr) { if (x === null) continue; if (u === undefined) u = x; else if (x !== u) return undefined; } return u; }

/* ───────────── Estrategias: simulador de órdenes (backtesting) ─────────────
   Reglas (documentadas en el README; no se promete equivalencia exacta con TradingView):
   · Una orden de mercado puesta en la vela i se ejecuta en la apertura de la vela i+1 (o al cierre de i con process_orders_on_close).
   · Órdenes límite/stop se ejecutan dentro de la vela siguiendo la ruta O→H→L→C (si la máxima está más cerca de la apertura) u O→L→H→C.
   · Comisión (percent / cash_per_order / cash_per_contract) y deslizamiento (ticks) en cada ejecución. Sin margen ni liquidaciones.
   · Solo velas históricas: calc_on_every_tick / calc_on_order_fills no se simulan. */
class Broker {
  constructor(ctx, p) {
    this.ctx = ctx; this.init = p.init; this.qtyType = p.qtyType; this.qtyVal = p.qtyVal; this.pyr = Math.max(1, p.pyramiding | 0);
    this.commType = p.commType; this.commVal = p.commVal; this.slip = p.slip; this.onClose = !!p.onClose; this.tick = ctx.mintick || 0.01;
    this.title = p.title; this.currency = p.currency;
    this.open = []; this.closed = []; this.orders = []; this.marks = []; this.equity = []; this.net = 0; this.openComm = 0; this.nid = 0;
    this.peak = p.init; this.maxDD = 0; this.maxDDpct = 0; this.maxRun = 0; this.cur = null; this.lastEq = p.init;
  }
  get pos() { let s = 0; for (const t of this.open) s += t.dir * t.qty; return s; }
  get avg() { let q = 0, v = 0; for (const t of this.open) { q += t.qty; v += t.qty * t.entry; } return q ? v / q : null; }
  openProfit(px) { let s = 0; for (const t of this.open) s += t.dir * (px - t.entry) * t.qty; return s; }
  get eq() { const px = this.cur ? this.cur.c : 0; return this.init + this.net + this.openProfit(px) - this.openComm; }
  comm(price, qty) { return this.commType === 'percent' ? price * qty * this.commVal / 100 : this.commType === 'cash_per_order' ? this.commVal : this.commType === 'cash_per_contract' ? this.commVal * qty : 0; }
  defQty(price) {
    const eq = Math.max(0, this.init + this.net - this.openComm);
    return this.qtyType === 'cash' ? this.qtyVal / price : this.qtyType === 'percent_of_equity' ? eq * this.qtyVal / 100 / price : this.qtyVal;
  }
  place(o) { // reemplaza una orden pendiente con el mismo tipo e id
    const i = this.orders.findIndex(x => x.type === o.type && x.id === o.id && x.from === o.from);
    o.seq = i >= 0 ? this.orders[i].seq : ++this.nid; o.bar = this.ctx.bar;
    if (i >= 0) this.orders[i] = o; else this.orders.push(o);
  }
  cancel(id) { this.orders = this.orders.filter(o => o.id !== id); }
  fill(price, dir) { return price + dir * this.slip * this.tick; }
  closeQty(t, qty, price, bar, exitId) { // cierra (parte de) una operación abierta
    qty = Math.min(qty, t.qty); const gross = t.dir * (price - t.entry) * qty, cIn = t.comm * qty / t.qty, cOut = this.comm(price, qty);
    this.closed.push({id: t.id, dir: t.dir, qty, entry: t.entry, entryBar: t.bar, exit: price, exitBar: bar, exitId: exitId || '', profit: gross - cIn - cOut, comm: cIn + cOut, runup: t.runup, dd: t.dd});
    this.net += gross - cIn - cOut; this.openComm -= cIn; t.comm -= cIn; t.qty -= qty;
    this.marks.push({bar, price, kind: 'exit', dir: -t.dir, id: exitId || t.id, profit: gross - cIn - cOut});
    if (t.qty <= 1e-12) this.open.splice(this.open.indexOf(t), 1);
  }
  openTrade(o, price, bar) {
    let qty = o.qty != null ? o.qty : this.defQty(price); if (!(qty > 0) || !isFinite(qty)) return;
    const c = this.comm(price, qty);
    this.open.push({id: o.id, dir: o.dir, qty, entry: price, bar, comm: c, runup: 0, dd: 0}); this.openComm += c;
    this.marks.push({bar, price, kind: 'entry', dir: o.dir, id: o.id, qty});
    for (const x of this.orders) if (x.type === 'exit' && x.pendRel && (!x.from || x.from === o.id)) { const L = o.dir === 1; if (x.rel.profit !== null && x.limit === null) x.limit = price + (L ? 1 : -1) * x.rel.profit * this.tick; if (x.rel.loss !== null && x.stop === null) x.stop = price - (L ? 1 : -1) * x.rel.loss * this.tick; x.pendRel = false; }
  }
  exec(o, price, bar) { // ejecuta una orden ya disparada al precio dado
    if (o.type === 'close') { for (const t of this.open.filter(x => x.id === o.id)) this.closeQty(t, o.qtyPct != null ? t.qty * o.qtyPct / 100 : (o.qty != null ? o.qty : t.qty), this.fill(price, -t.dir), bar, o.comment || o.id); this.orders = this.orders.filter(x => x !== o); return; }
    if (o.type === 'closeall') { for (const t of [...this.open]) this.closeQty(t, t.qty, this.fill(price, -t.dir), bar, o.comment || 'Cerrar todo'); this.orders = this.orders.filter(x => x !== o); return; }
    if (o.type === 'exit') {
      const ts = this.open.filter(t => !o.from || t.id === o.from); if (!ts.length) return;
      for (const t of ts) this.closeQty(t, o.qtyPct != null ? t.qty * o.qtyPct / 100 : (o.qty != null ? Math.min(o.qty, t.qty) : t.qty), this.fill(price, -t.dir), bar, o.comment || o.id);
      this.orders = this.orders.filter(x => x !== o); return;
    }
    // entry / order
    const p = this.fill(price, o.dir); this.orders = this.orders.filter(x => x !== o);
    const opp = this.open.filter(t => t.dir === -o.dir);
    if (o.type === 'entry') {
      if (opp.length) { for (const t of [...opp]) this.closeQty(t, t.qty, p, bar, 'Inversión: ' + o.id); }
      else if (this.open.length >= this.pyr || this.open.some(t => t.id === o.id && this.pyr === 1)) return;
      this.openTrade(o, p, bar);
    } else { // strategy.order: neteo FIFO
      let q = o.qty != null ? o.qty : this.defQty(p);
      for (const t of [...opp]) { if (q <= 0) break; const c = Math.min(q, t.qty); this.closeQty(t, c, p, bar, o.id); q -= c; }
      if (q > 1e-12) this.openTrade(Object.assign({}, o, {qty: q}), p, bar);
    }
  }
  // instante (0..3) y precio en que la ruta de la vela alcanza un nivel; test indica la condición de disparo
  hit(k, level, test) {
    if (test(k.o)) return {t: 0, px: k.o};
    const hf = Math.abs(k.h - k.o) <= Math.abs(k.l - k.o), pts = hf ? [k.o, k.h, k.l, k.c] : [k.o, k.l, k.h, k.c];
    for (let i = 0; i < 3; i++) { const a = pts[i], b = pts[i + 1]; if ((a - level) * (b - level) <= 0 && a !== b) return {t: i + (level - a) / (b - a), px: level}; if (a === level) return {t: i, px: level}; }
    return null;
  }
  trig(o, k) { // → {t, px} | null
    const L = o.limit, S = o.stop, long = o.type === 'exit' ? o.exitDir === 1 : o.dir === 1;
    if (o.type === 'exit') { // exitDir: dirección de la posición que se cierra
      const best = [];
      const tgt = o.limit != null ? this.hit(k, o.limit, x => long ? x >= o.limit : x <= o.limit) : null;
      let stp = o.stop != null ? this.hit(k, o.stop, x => long ? x <= o.stop : x >= o.stop) : null;
      if (tgt) best.push(tgt); if (stp) best.push(stp);
      if (o.trail) { const tr = this.trailLevel(o, k, long); if (tr) best.push(tr); }
      if (!best.length) return null; best.sort((a, b) => a.t - b.t); return best[0];
    }
    if (L == null && S == null) return {t: 0, px: k.o};
    if (S != null && L != null) { const h = this.hit(k, S, x => o.dir === 1 ? x >= S : x <= S); if (!h) return null; const ok = o.dir === 1 ? k.l <= L || h.px <= L : k.h >= L || h.px >= L; return ok ? {t: h.t, px: o.dir === 1 ? Math.min(L, Math.max(h.px, S)) : Math.max(L, Math.min(h.px, S))} : null; }
    if (S != null) return this.hit(k, S, x => o.dir === 1 ? x >= S : x <= S);
    const h = this.hit(k, L, x => o.dir === 1 ? x <= L : x >= L); return h ? {t: h.t, px: o.dir === 1 ? Math.min(h.px, L) : Math.max(h.px, L)} : null;
  }
  trailLevel(o, k, long) { // stop dinámico (aproximado): sigue el extremo favorable y se evalúa según la ruta de la vela
    const tr = o.trail, ent = (this.open.find(t => !o.from || t.id === o.from) || {}).entry; if (ent == null) return null;
    const act = tr.price != null ? tr.price : ent + (long ? 1 : -1) * (tr.points || 0) * this.tick, off = (tr.offset || 0) * this.tick, s = long ? 1 : -1;
    const fav = long ? k.h : k.l, adv = long ? k.l : k.h, hf = Math.abs(k.h - k.o) <= Math.abs(k.l - k.o), favFirst = long ? hf : !hf;
    const beyond = (x, lvl) => long ? x <= lvl : x >= lvl, prev = tr.ext != null;
    if (!prev && !(long ? fav >= act : fav <= act)) return null;
    const base = prev ? tr.ext : act, newExt = long ? Math.max(base, fav) : Math.min(base, fav), lvl0 = base - s * off, lvl1 = newExt - s * off;
    let hit = null;
    if (prev && beyond(k.o, lvl0)) hit = {t: 0, px: k.o};
    else if (prev && !favFirst && beyond(adv, lvl0)) hit = {t: 1, px: lvl0};
    else if (favFirst && beyond(adv, lvl1)) hit = {t: 1.5, px: lvl1};
    else if (!favFirst && beyond(k.c, lvl1)) hit = {t: 2.5, px: lvl1};
    if (!hit) tr.ext = newExt; return hit;
  }
  beginBar(bar, k) { // al abrir la vela: se ejecutan las órdenes puestas en la vela anterior
    this.cur = k;
    for (const o of [...this.orders]) if (o.type !== 'exit' && o.limit == null && o.stop == null && this.orders.includes(o)) { if (o.bar < bar || o.bar === bar && false) this.exec(o, k.o, bar); }
    this.stepTriggers(bar, k);
  }
  stepTriggers(bar, k) {
    for (let guard = 0; guard < 60; guard++) {
      let best = null;
      for (const o of this.orders) {
        if (o.type === 'close' || o.type === 'closeall') continue;
        if (o.type === 'exit') { const ts = this.open.filter(t => !o.from || t.id === o.from); if (!ts.length) continue; o.exitDir = ts[0].dir; }
        else if (o.bar >= bar && !(o.fresh === false)) continue; // las órdenes nuevas actúan desde la vela siguiente
        const r = this.trig(o, k); if (r && (!best || r.t < best.r.t || (r.t === best.r.t && o.seq < best.o.seq))) best = {o, r};
      }
      if (!best) break; this.exec(best.o, best.r.px, bar);
    }
    // exits huérfanos: sin operación abierta ni entrada pendiente con ese id
    this.orders = this.orders.filter(o => o.type !== 'exit' || this.open.some(t => !o.from || t.id === o.from) || this.orders.some(e => e.type !== 'exit' && e.id === o.from));
  }
  endBar(bar, k) { // tras ejecutar el script
    this.cur = k;
    if (this.onClose) { for (const o of [...this.orders]) if ((o.type !== 'exit') && o.limit == null && o.stop == null && o.bar === bar) this.exec(o, k.c, bar); }
    for (const t of this.open) { const pl = t.dir * (k.c - t.entry) * t.qty; t.runup = Math.max(t.runup, t.dir * ((t.dir === 1 ? k.h : k.l) - t.entry) * t.qty); t.dd = Math.min(t.dd, t.dir * ((t.dir === 1 ? k.l : k.h) - t.entry) * t.qty); void pl; }
    const e = this.eq; this.equity[bar] = e; this.lastEq = e; if (e > this.peak) this.peak = e;
    const dd = this.peak - e; if (dd > this.maxDD) { this.maxDD = dd; this.maxDDpct = this.peak > 0 ? dd / this.peak * 100 : 0; }
    if (e - this.init > this.maxRun) this.maxRun = e - this.init;
  }
  stats(cs) {
    const all = this.closed, W = all.filter(t => t.profit > 0), Ls = all.filter(t => t.profit < 0), gp = W.reduce((s, t) => s + t.profit, 0), gl = Ls.reduce((s, t) => s + t.profit, 0);
    const lastC = cs[cs.length - 1].c, op = this.openProfit(lastC), n = all.length;
    return {init: this.init, net: this.net, netPct: this.net / this.init * 100, openProfit: op, equity: this.init + this.net + op - this.openComm, grossProfit: gp, grossLoss: gl, profitFactor: gl < 0 ? gp / -gl : (gp > 0 ? Infinity : null),
      trades: n, wins: W.length, losses: Ls.length, winRate: n ? W.length / n * 100 : null, avgTrade: n ? this.net / n : null, avgWin: W.length ? gp / W.length : null, avgLoss: Ls.length ? gl / Ls.length : null,
      largestWin: W.length ? Math.max(...W.map(t => t.profit)) : null, largestLoss: Ls.length ? Math.min(...Ls.map(t => t.profit)) : null, longs: all.filter(t => t.dir === 1).length, shorts: all.filter(t => t.dir === -1).length,
      maxDD: this.maxDD, maxDDpct: this.maxDDpct, openTrades: this.open.length, commission: all.reduce((s, t) => s + t.comm, 0) + this.openComm, buyHoldPct: (lastC / cs[0].o - 1) * 100,
      avgBars: n ? all.reduce((s, t) => s + (t.exitBar - t.entryBar), 0) / n : null};
  }
  result(cs) {
    const tr = this.closed.slice(-5000).map(t => [t.id, t.dir, t.qty, t.entry, t.entryBar, t.exit, t.exitBar, t.profit, t.exitId]);
    const op = this.open.map(t => [t.id, t.dir, t.qty, t.entry, t.bar, null, null, t.dir * (cs[cs.length - 1].c - t.entry) * t.qty, '']);
    return {title: this.title, currency: this.currency, params: {qtyType: this.qtyType, qtyVal: this.qtyVal, pyramiding: this.pyr, commType: this.commType, commVal: this.commVal, slippage: this.slip, onClose: this.onClose},
      stats: this.stats(cs), trades: tr, open: op, equity: this.equity.map(v => v === undefined ? null : Math.round(v * 1e6) / 1e6), marks: this.marks.slice(-1500), tradesTotal: this.closed.length};
  }
}
const dirOf = d => d === false || String(d).replace(/^strategy\./, '') === 'short' ? -1 : 1;
const whenOk = (a, i) => a[i] === undefined || truthy(a[i]);
const STRAT_SIG = ['title', 'shorttitle', 'overlay', 'format', 'precision', 'scale', 'pyramiding', 'calc_on_order_fills', 'calc_on_every_tick', 'max_bars_back', 'backtest_fill_limits_assumption', 'default_qty_type', 'default_qty_value', 'initial_capital', 'currency', 'slippage', 'commission_type', 'commission_value', 'process_orders_on_close', 'close_entries_rule', 'margin_long', 'margin_short', 'explicit_plot_zorder', 'max_lines_count', 'max_labels_count', 'max_boxes_count', 'max_polylines_count', 'risk_free_rate', 'use_bar_magnifier', 'fill_orders_on_standard_ohlc', 'calc_bars_count', 'dynamic_requests', 'behind_chart'];
const SI = Object.fromEntries(STRAT_SIG.map((k, i) => [k, i]));
def('strategy', STRAT_SIG, (a, c) => {
  const ctx = c.ctx, m = ctx.out.meta; m.kind = 'strategy'; if (typeof a[0] === 'string') m.title = a[0]; if (typeof a[1] === 'string') m.short = a[1]; m.overlay = a[2] === true;
  if (ctx.secondary || ctx.broker) return null;
  const g = k => a[SI[k]], ty = String(g('default_qty_type') || 'fixed').replace(/^strategy\./, ''), ct = String(g('commission_type') || 'percent').replace(/^strategy\.commission\./, '').replace(/^commission\./, '');
  if (g('calc_on_every_tick') === true) warn(ctx, c.line, 'calc_on_every_tick no se simula: el backtest usa solo velas cerradas', 'st-tick', 'info');
  if (g('margin_long') > 0 || g('margin_short') > 0) warn(ctx, c.line, 'Margen y liquidaciones no se simulan en el backtest', 'st-margin', 'info');
  ctx.broker = new Broker(ctx, {title: m.title, init: g('initial_capital') > 0 ? g('initial_capital') : 1000000, qtyType: ['cash', 'percent_of_equity'].includes(ty) ? ty : 'fixed', qtyVal: g('default_qty_value') != null ? +g('default_qty_value') : 1, pyramiding: g('pyramiding') != null ? g('pyramiding') : 1,
    commType: ['percent', 'cash_per_order', 'cash_per_contract'].includes(ct) ? ct : 'percent', commVal: +g('commission_value') || 0, slip: +g('slippage') || 0, onClose: g('process_orders_on_close') === true, currency: typeof g('currency') === 'string' ? g('currency') : 'USDT'});
  return null;
}, {lenient: true});
const needB = (c, nm) => { const b = c.ctx.broker; if (!b && !c.ctx.secondary) warn(c.ctx, c.line, `${nm}() solo funciona en un script declarado con strategy(...)`, 'st-nb:' + nm, 'unsupported'); return b && !c.ctx.secondary ? b : null; };
const tk = (c, v) => isna(v) ? null : v, tickN = (c, v) => isna(v) ? null : v * c.ctx.mintick;
def('strategy.entry', ['id', 'direction', 'qty', 'limit', 'stop', 'oca_name', 'oca_type', 'comment', 'alert_message', 'disable_alert', 'when'], (a, c) => { const b = needB(c, 'strategy.entry'); if (b && whenOk(a, 10)) b.place({type: 'entry', id: String(a[0]), dir: dirOf(a[1]), qty: isna(a[2]) ? null : a[2], limit: tk(c, a[3]), stop: tk(c, a[4]), comment: a[7]}); return null; }, {lenient: true});
def('strategy.order', ['id', 'direction', 'qty', 'limit', 'stop', 'oca_name', 'oca_type', 'comment', 'alert_message', 'disable_alert', 'when'], (a, c) => { const b = needB(c, 'strategy.order'); if (b && whenOk(a, 10)) b.place({type: 'order', id: String(a[0]), dir: dirOf(a[1]), qty: isna(a[2]) ? null : a[2], limit: tk(c, a[3]), stop: tk(c, a[4]), comment: a[7]}); return null; }, {lenient: true});
def('strategy.close', ['id', 'comment', 'qty', 'qty_percent', 'alert_message', 'immediately', 'disable_alert', 'when'], (a, c) => { const b = needB(c, 'strategy.close'); if (b && whenOk(a, 7)) b.place({type: 'close', id: String(a[0]), qty: isna(a[2]) ? null : a[2], qtyPct: isna(a[3]) ? null : a[3], comment: a[1], limit: null, stop: null}); return null; }, {lenient: true});
def('strategy.close_all', ['comment', 'alert_message', 'immediately', 'disable_alert', 'when'], (a, c) => { const b = needB(c, 'strategy.close_all'); if (b && whenOk(a, 4)) b.place({type: 'closeall', id: '*', comment: a[0], limit: null, stop: null}); return null; }, {lenient: true});
def('strategy.exit', ['id', 'from_entry', 'qty', 'qty_percent', 'profit', 'limit', 'loss', 'stop', 'trail_price', 'trail_points', 'trail_offset', 'oca_name', 'comment', 'comment_profit', 'comment_loss', 'comment_trailing', 'alert_message', 'alert_profit', 'alert_loss', 'alert_trailing', 'disable_alert', 'when'], (a, c) => {
  const b = needB(c, 'strategy.exit'); if (!b || !whenOk(a, 21)) return null; const from = isna(a[1]) ? '' : String(a[1]);
  let limit = tk(c, a[5]), stop = tk(c, a[7]); const ent = b.open.find(t => !from || t.id === from), ref = ent ? ent.entry : (b.orders.find(o => o.type === 'entry' && (!from || o.id === from)) || {}).limit;
  const long = ent ? ent.dir === 1 : ((b.orders.find(o => o.type === 'entry' && (!from || o.id === from)) || {dir: 1}).dir === 1);
  const rel = {profit: isna(a[4]) ? null : a[4], loss: isna(a[6]) ? null : a[6]};
  const o = {type: 'exit', id: String(a[0]), from, qty: isna(a[2]) ? null : a[2], qtyPct: isna(a[3]) ? null : a[3], limit, stop, comment: a[12], rel, trail: (!isna(a[8]) || !isna(a[9])) ? {price: isna(a[8]) ? null : a[8], points: isna(a[9]) ? null : a[9], offset: isna(a[10]) ? 0 : a[10], ext: null} : null};
  if (ent) { // profit/loss en ticks, relativos al precio de entrada
    if (rel.profit !== null && limit === null) o.limit = ent.entry + (long ? 1 : -1) * rel.profit * c.ctx.mintick;
    if (rel.loss !== null && stop === null) o.stop = ent.entry - (long ? 1 : -1) * rel.loss * c.ctx.mintick;
  } else { o.pendRel = true; }
  const prev = b.orders.find(x => x.type === 'exit' && x.id === o.id && x.from === o.from); if (prev && prev.trail && o.trail && prev.trail.ext != null) o.trail.ext = prev.trail.ext;
  if (!ent && (rel.profit !== null || rel.loss !== null)) { // entrada aún pendiente: se calcula con el precio de ejecución al activarse
    const en = b.orders.find(x => x.type === 'entry' && (!from || x.id === from)); if (en && en.limit != null) { const L = en.dir === 1; if (rel.profit !== null && limit === null) o.limit = en.limit + (L ? 1 : -1) * rel.profit * c.ctx.mintick; if (rel.loss !== null && stop === null) o.stop = en.limit - (L ? 1 : -1) * rel.loss * c.ctx.mintick; }
  }
  b.place(o); return null;
}, {lenient: true});
def('strategy.cancel', ['id'], (a, c) => { const b = needB(c, 'strategy.cancel'); if (b) b.cancel(String(a[0])); return null; }, {lenient: true});
def('strategy.cancel_all', [], (a, c) => { const b = needB(c, 'strategy.cancel_all'); if (b) b.orders = []; return null; }, {lenient: true});
for (const nm of ['strategy.risk.allow_entry_in', 'strategy.risk.max_cons_loss_days', 'strategy.risk.max_drawdown', 'strategy.risk.max_intraday_filled_orders', 'strategy.risk.max_intraday_loss', 'strategy.risk.max_position_size']) def(nm, null, (a, c) => { warn(c.ctx, c.line, `${nm}() se ignora en el backtest`, 'ign:' + nm, 'info'); return null; }, {lenient: true});
const ST_VARS = {position_size: b => b.pos, position_avg_price: b => b.avg, equity: b => b.eq, netprofit: b => b.net, openprofit: b => b.openProfit(b.cur ? b.cur.c : 0), initial_capital: b => b.init,
  grossprofit: b => b.closed.reduce((s, t) => s + (t.profit > 0 ? t.profit : 0), 0), grossloss: b => b.closed.reduce((s, t) => s + (t.profit < 0 ? -t.profit : 0), 0),
  closedtrades: b => b.closed.length, opentrades: b => b.open.length, wintrades: b => b.closed.filter(t => t.profit > 0).length, losstrades: b => b.closed.filter(t => t.profit < 0).length, eventrades: b => b.closed.filter(t => t.profit === 0).length,
  max_drawdown: b => b.maxDD, max_runup: b => b.maxRun, position_entry_name: b => b.open.length ? b.open[b.open.length - 1].id : ''};
for (const k in ST_VARS) CONSTS['strategy.' + k] = c => c.broker ? ST_VARS[k](c.broker) : (k === 'position_entry_name' ? '' : k === 'position_avg_price' ? null : 0);
const trField = {entry_price: t => t.entry, exit_price: t => t.exit, entry_bar_index: t => t.entryBar, exit_bar_index: t => t.exitBar, size: t => t.dir * t.qty, profit: t => t.profit, commission: t => t.comm, entry_id: t => t.id, exit_id: t => t.exitId, entry_time: (t, c) => c.candles[t.entryBar].t, exit_time: (t, c) => c.candles[t.exitBar].t, max_runup: t => t.runup, max_drawdown: t => t.dd};
for (const k in trField) {
  def('strategy.closedtrades.' + k, ['trade_num'], (a, c) => { const b = c.ctx.broker; if (!b || isna(a[0])) return null; const t = b.closed[a[0]]; return t ? trField[k](t, c.ctx) : null; }, {lenient: true});
  def('strategy.opentrades.' + k, ['trade_num'], (a, c) => { const b = c.ctx.broker; if (!b || isna(a[0])) return null; const t = b.open[a[0]]; if (!t) return null; return k === 'entry_price' ? t.entry : k === 'entry_bar_index' ? t.bar : k === 'size' ? t.dir * t.qty : k === 'entry_id' ? t.id : k === 'profit' ? t.dir * (b.cur.c - t.entry) * t.qty : k === 'entry_time' ? c.ctx.candles[t.bar].t : k === 'commission' ? t.comm : null; }, {lenient: true});
}

function loopProgram(ast, ctx) {
  const gframe = new Frame(); ctx.frameList.push(gframe); ctx.globalScope = {m: new Map(), up: null};
  const env = {ctx, scope: ctx.globalScope, frame: gframe};
  for (let bar = 0; bar < ctx.n; bar++) {
    ctx.bar = bar;
    for (const fr of ctx.frameList) for (const v of fr.vars.values()) if (!v.isVar) v.cur = null;
    if (ctx.broker) ctx.broker.beginBar(bar, ctx.candles[bar]);
    execBlock(ast, env); ctx.ctrl = null;
    if (ctx.broker) ctx.broker.endBar(bar, ctx.candles[bar]);
    for (const fr of ctx.frameList) for (const v of fr.vars.values()) v.hist[bar] = v.cur;
  }
}
const freshOut = name => ({meta: {kind: 'indicator', title: name || 'Script', overlay: false}, plots: [], hlines: [], fills: [], bgcolors: [], barcolors: [], shapes: [], alerts: [], labels: Object.assign([], {__n: 'l'}), lines: Object.assign([], {__n: 'n'}), boxes: Object.assign([], {__n: 'b'}), polylines: Object.assign([], {__n: 'p'}), tables: [], candles: [], linefills: [], inputs: [], palette: [], _p: {}});

/* ───────────── request.security: otras temporalidades y símbolos ─────────────
   Pine recalcula TODO el script con los datos del otro símbolo/temporalidad. Aquí se hace igual: se ejecuta el script entero
   sobre las velas pedidas (sin dibujar) y se anota el valor de cada llamada a request.security en cada vela; luego se
   asigna a las velas del gráfico con las reglas de lookahead de TradingView. Las velas las aporta la aplicación (opts.sec). */
const TFMS = Object.assign(Object.create(null), {'1m': 6e4, '3m': 18e4, '5m': 3e5, '15m': 9e5, '30m': 18e5, '1h': 36e5, '2h': 72e5, '4h': 144e5, '6h': 216e5, '8h': 288e5, '12h': 432e5, '1d': 864e5, '3d': 2592e5, '1w': 6048e5, '1M': 2592e6, '3M': 7776e6, '12M': 31536e6});
const tfms = k => TFMS[k] || (/^x\d+$/.test(k) ? +k.slice(1) * 6e4 : 0);
const MIN2KEY = {1: '1m', 3: '3m', 5: '5m', 15: '15m', 30: '30m', 60: '1h', 120: '2h', 240: '4h', 360: '6h', 480: '8h', 720: '12h'};
function tfKey(tf, ctx) {
  if (isna(tf) || tf === '') return ctx.interval;
  const m = /^(\d*)([A-Za-z]?)$/.exec(String(tf).trim()); if (!m) return null;
  const k = m[1] === '' ? 1 : +m[1], u = m[2];
  const syn = mm => mm >= 1 && mm <= 525600 && Number.isInteger(mm) ? 'x' + mm : null; // temporalidad que Binance no tiene (3 h, 2 D, 45 min…): se arma juntando velas menores
  if (u === '' || u === 'm') return MIN2KEY[k] || syn(k);
  if (u === 'h' || u === 'H') return MIN2KEY[k * 60] || syn(k * 60);
  if (u === 'D' || u === 'd') return k === 1 ? '1d' : k === 3 ? '3d' : syn(k * 1440);
  if (u === 'W' || u === 'w') return k === 1 ? '1w' : null;
  if (u === 'M') return k === 1 ? '1M' : k === 3 ? '3M' : k === 12 ? '12M' : null;
  return null;
}
function toHA(cs) { const out = []; let po = null, pc = null; for (const k of cs) { const c = (k.o + k.h + k.l + k.c) / 4, o = po === null ? (k.o + k.c) / 2 : (po + pc) / 2; out.push({t: k.t, o, h: Math.max(k.h, o, c), l: Math.min(k.l, o, c), c, v: k.v}); po = o; pc = c; } return out; }
/* Símbolos de otros exchanges en request.security, como en TradingView: «BINANCE:BTCUSDT», «BYBIT:SOLUSDT.P», «BINGX:BTCUSDT.P», «OKX:ETHUSDT.P»,
   «COINBASE:BTCUSD», «KUCOIN:…», «GATEIO:…», «MEXC:…», «BITGET:…», «HTX:…», «KRAKEN:…». Sin prefijo = el exchange del gráfico.
   Se convierten a la clave de VORTEX (BTCUSDT, SOLUSDT@bybitf, BTC-USDT@bingxf…) y la app descarga esas velas (markets.js · klinesAny). */
const SEC_PFX = {BINANCE: 'binance', BINANCEUS: 'binance', BYBIT: 'bybit', OKX: 'okx', OKEX: 'okx', BINGX: 'bingx', COINBASE: 'coinbase', GDAX: 'coinbase', KUCOIN: 'kucoin', GATEIO: 'gate', GATE: 'gate', MEXC: 'mexc', BITGET: 'bitget', HTX: 'htx', HUOBI: 'htx', KRAKEN: 'kraken'};
const SEC_PERP = {binance: 'binancef', bybit: 'bybitf', okx: 'okxf', bingx: 'bingxf'}, SEC_NAME = {binance: 'BINANCE', binancef: 'BINANCE', bybit: 'BYBIT', bybitf: 'BYBIT', okx: 'OKX', okxf: 'OKX', bingx: 'BINGX', bingxf: 'BINGX', coinbase: 'COINBASE', kucoin: 'KUCOIN', gate: 'GATEIO', mexc: 'MEXC', bitget: 'BITGET', htx: 'HTX', kraken: 'KRAKEN'};
const SEC_DASH = new Set(['okx', 'okxf', 'bingx', 'bingxf', 'kucoin', 'coinbase', 'kraken']);
function secSplit(s) { for (const q of ['USDT', 'USDC', 'FDUSD', 'USD', 'BTC', 'EUR']) if (s.length > q.length && s.endsWith(q)) return [s.slice(0, -q.length), q]; return null; }
/* Símbolos que no son de cripto (bolsa, índices, divisas, materias primas, dominancia) → velas del servidor de VORTEX (Yahoo) o de la dominancia */
const YH_MAP = {DXY: 'DX-Y.NYB', VIX: '^VIX', VXN: '^VXN', SPX: '^GSPC', SPX500: '^GSPC', SPY: 'SPY', NDX: '^NDX', IXIC: '^IXIC', NAS100: '^NDX', US100: '^NDX', DJI: '^DJI', US30: '^DJI', RUT: '^RUT', US10Y: '^TNX', US30Y: '^TYX', US05Y: '^FVX', TNX: '^TNX',
  GOLD: 'GC=F', XAUUSD: 'GC=F', SILVER: 'SI=F', XAGUSD: 'SI=F', USOIL: 'CL=F', WTI: 'CL=F', UKOIL: 'BZ=F', BRENT: 'BZ=F', NATGAS: 'NG=F', COPPER: 'HG=F', NI225: '^N225', DAX: '^GDAXI', DE40: '^GDAXI', UKX: '^FTSE', UK100: '^FTSE', HSI: '^HSI', CAC40: '^FCHI', FCHI: '^FCHI', STOXX50E: '^STOXX50E', SX5E: '^STOXX50E', NIFTY: '^NSEI', BANKNIFTY: '^NSEBANK', SENSEX: '^BSESN'};
const YH_SFX = {NSE: '.NS', BSE: '.BO', TSX: '.TO', TSXV: '.V', LSE: '.L', XETR: '.DE', FWB: '.F', MOEX: '.ME', ASX: '.AX', HKEX: '.HK', TSE: '.T', BMV: '.MX', BMFBOVESPA: '.SA', EURONEXT: '.PA', MIL: '.MI', BME: '.MC', SIX: '.SW', KRX: '.KS', TWSE: '.TW', SGX: '.SI'};
const YH_STOCK = new Set(['NASDAQ', 'NYSE', 'AMEX', 'NYSEARCA', 'ARCA', 'BATS', 'CBOE', 'OTC', 'NYSEAMERICAN', 'US']);
const YH_FX = new Set(['FX', 'OANDA', 'FX_IDC', 'FOREXCOM', 'PEPPERSTONE', 'FXCM', 'SAXO', 'ICMARKETS', 'CAPITALCOM', 'EIGHTCAP', 'BLACKBULL', 'TVC']);
function yhKey(pfx, s) {
  if ((pfx === 'CRYPTOCAP' || !pfx) && /^(BTC|USDT)\.D$/.test(s)) return {key: s + '@dom', sym: s, src: 'dom'};
  let y = null;
  if (YH_MAP[s]) y = YH_MAP[s];
  else if (/^([A-Z]{1,3})[12]!$/.test(s) && pfx !== 'BINANCE') y = /^([A-Z]{1,3})/.exec(s)[1] + '=F'; // futuros continuos: ES1!, NQ1!, GC1!, CL1!…
  else if (pfx && YH_SFX[pfx] && /^[A-Z0-9.&_-]{1,15}$/.test(s)) y = (pfx === 'HKEX' ? s.padStart(4, '0') : s.replace(/_/g, '-')) + YH_SFX[pfx];
  else if (pfx && YH_FX.has(pfx) && /^[A-Z]{6}$/.test(s)) y = s + '=X';
  else if (pfx && YH_STOCK.has(pfx) && /^[A-Z][A-Z0-9.]{0,9}$/.test(s)) y = s.replace(/\./g, '-');
  return y ? {key: y + '@yh', sym: y, src: 'yh'} : null;
}
function secKey(raw, exch) { // → {key, sym, src} o null
  let s = String(raw).trim().toUpperCase(), src = exch || 'binance';
  { const mm = /^([A-Z0-9_]+):(.+)$/.exec(s), pfx = mm ? mm[1] : '', rest = mm ? mm[2] : s; if (!(pfx && SEC_PFX[pfx])) { const y = yhKey(pfx, rest); if (y) return y; } }
  const m = /^([A-Z0-9_]+):(.+)$/.exec(s);
  if (m) { const p = SEC_PFX[m[1]];
    if (!p) { if (!/^[A-Z0-9]{2,15}[-_/]?(USDT|USDC|USD|BTC|ETH|EUR|PERP)(\.P)?$/.test(m[2])) return null; src = 'binance'; s = m[2].replace(/[-_/]/g, '').replace(/USD(\.P)?$/, 'USDT$1').replace(/PERP$/, 'USDT.P'); } // otro exchange de cripto (Bitfinex, Bitstamp, Coinbase USD…): el mismo par en Binance
    else { src = p; s = m[2]; } }
  let perp = /\.P$|PERP$/.test(s); s = s.replace(/\.P$|PERP$/, '');
  if (m && perp && SEC_PERP[src]) src = SEC_PERP[src]; else if (!m && perp && SEC_PERP[src]) src = SEC_PERP[src];
  const glued = s.replace(/[-_/]/g, ''); if (!/^[A-Z0-9]{3,24}$/.test(glued)) return null;
  const sp = secSplit(glued), sym = sp && SEC_DASH.has(src) ? sp[0] + '-' + sp[1] : sp && src === 'gate' ? sp[0] + '_' + sp[1] : glued;
  return {key: src === 'binance' ? sym : sym + '@' + src, sym, src};
}
function evSecurity(n, env) {
  const ctx = env.ctx, A = {}, names = ['symbol', 'timeframe', 'expression', 'gaps', 'lookahead', 'ignore_invalid_symbol', 'currency', 'calc_bars_count']; let pos = 0;
  for (const a of n.args) A[a.name || names[pos++]] = a;
  if (!A.symbol || !A.timeframe || !A.expression) throw new PineError('request.security() necesita símbolo, temporalidad y expresión', n.line);
  let sym = ev(A.symbol.e, env); const tf = ev(A.timeframe.e, env), look = A.lookahead ? ev(A.lookahead.e, env) : 'lookahead_off';
  let ha = false; if (typeof sym === 'string' && sym.startsWith('HA:')) { ha = true; sym = sym.slice(3); }
  const sk = isna(sym) || sym === '' ? {key: ctx.symKey || ctx.symbol, sym: ctx.symbol, src: ctx.exch || 'binance'} : secKey(sym, ctx.exch);
  const tfk = tfKey(tf, ctx);
  if (!sk || !tfk) { if (!ctx.secondary) { warn(ctx, n.line, `request.security(${isna(sym) ? 'na' : sym}, ${tf}) no soportado: usa un símbolo como BTCUSDT o EXCHANGE:BTCUSDT (Binance, Bybit, OKX, BingX, Coinbase, KuCoin, Gate, MEXC, Bitget, HTX, Kraken; «.P» = perpetuo) y temporalidades de 1m a 12M`, 'sec:' + sym + tf, 'unsupported'); ctx.incomplete = true; } return null; }
  sym = sk.key; const key = sym + '|' + tfk, same = (sym === (ctx.symKey || ctx.symbol) || (sk.src === (ctx.exch || 'binance') && sk.sym.replace(/[-_]/g, '') === String(ctx.symbol).replace(/[-_]/g, ''))) && tfk === ctx.interval;
  if (same && (!ha || ctx.secondary)) { const v = ev(A.expression.e, env); if (ctx.secondary) { let r = ctx.rec.get(n); if (!r) ctx.rec.set(n, r = []); r[ctx.bar] = v; } return v; }
  if (ctx.secondary) return null;
  let data = same ? ctx.candles : ctx.opts.sec && ctx.opts.sec[key];
  if (data && ha) { const hk = key + '|ha'; data = (ctx.haCache || (ctx.haCache = new Map())).get(hk) || (ctx.haCache.set(hk, toHA(data)), ctx.haCache.get(hk)); }
  if (!data) { (ctx.needs || (ctx.needs = new Map())).set(key, {symbol: sym, interval: tfk}); ctx.incomplete = true; return null; }
  if (!data.length) { warn(ctx, n.line, `No se pudieron obtener velas de ${sym} en ${tfk}: devuelve na`, 'secfail:' + key, 'unsupported'); ctx.incomplete = true; return null; }
  const rk = ha ? key + '|ha' : key; let run = ctx.secRuns.get(rk); if (!run) { run = runSecondary(ctx, sym, tfk, rk, data); ctx.secRuns.set(rk, run); }
  const arr = run.rec.get(n); if (!arr) return null;
  const j = run.j[ctx.bar]; if (j < 0) return null;
  let v;
  if (look === 'lookahead_on' || ctx.bar === ctx.n - 1) v = arr[j];
  else { const hEnd = j + 1 < data.length ? data[j + 1].t : data[j].t + tfms(tfk), last = ctx.candles[ctx.bar].t + ctx.ms >= hEnd; v = last ? arr[j] : (j > 0 ? arr[j - 1] : null); }
  if (v === undefined) return null; return v instanceof Tup ? new Tup(v.a.slice()) : v;
}
/* Recorte para corridas secundarias: solo se ejecutan las sentencias de las que dependen los argumentos de request.security
   (cierre transitivo de nombres). El resto (tablas, plots, contadores…) no cambia lo que se anota, así que se omite. */
const SLICE_DRAW = new Set(['plot', 'plotshape', 'plotchar', 'plotarrow', 'plotcandle', 'plotbar', 'bgcolor', 'barcolor', 'fill', 'hline', 'alertcondition', 'alert', 'indicator', 'strategy']);
const sliceCache = new WeakMap();
function sliceForSecurity(ast) {
  if (sliceCache.has(ast)) return sliceCache.get(ast);
  const refsOf = (node, out) => { if (Array.isArray(node)) { for (const x of node) refsOf(x, out); } else if (node && typeof node === 'object') { if (typeof node.name === 'string') out.add(node.name); if (Array.isArray(node.names)) for (const q of node.names) out.add(q); for (const k in node) if (k !== 'line' && typeof node[k] === 'object') refsOf(node[k], out); } return out; };
  const defsOf = (node, out) => { if (Array.isArray(node)) { for (const x of node) defsOf(x, out); } else if (node && typeof node === 'object') { if ((node.k === 'decl' || node.k === 'assign' || node.k === 'fn') && typeof node.name === 'string') out.add(node.name); if (node.k === 'tdecl') for (const q of node.names) out.add(q); for (const k in node) if (k !== 'line' && typeof node[k] === 'object') defsOf(node[k], out); } return out; };
  const hasSec = node => { if (Array.isArray(node)) return node.some(hasSec); if (!node || typeof node !== 'object') return false; if (node.k === 'call' && node.fn && node.fn.k === 'mem' && (node.fn.prop === 'security' || node.fn.prop === 'security_lower_tf') && node.fn.obj && node.fn.obj.name === 'request') return true; for (const k in node) if (k !== 'line' && typeof node[k] === 'object' && hasSec(node[k])) return true; return false; };
  const DROP = new Set(['expr', 'decl', 'tdecl', 'assign', 'if', 'for', 'forin', 'while', 'switch']);
  const info = ast.map(st => ({st, seed: hasSec(st), defs: defsOf(st, new Set()), refs: refsOf(st, new Set()), draw: st.k === 'expr' && st.e && st.e.k === 'call' && ((st.e.fn.k === 'id' && SLICE_DRAW.has(st.e.fn.name)) || (st.e.fn.k === 'mem' && st.e.fn.obj.k === 'id' && ['label', 'line', 'box', 'table', 'linefill', 'polyline', 'strategy'].includes(st.e.fn.obj.name)))}));
  const keep = new Array(ast.length).fill(false), N = new Set();
  info.forEach((x, i) => { if (!DROP.has(x.st.k) || x.seed) { keep[i] = true; for (const r of x.refs) N.add(r); } });
  let changed = true;
  while (changed) { changed = false;
    info.forEach((x, i) => { if (keep[i] || x.draw) return; let hit = false; for (const d of x.defs) if (N.has(d)) { hit = true; break; } if (!hit && x.st.k === 'expr') for (const r of x.refs) if (N.has(r)) { hit = true; break; } if (hit) { keep[i] = true; changed = true; for (const r of x.refs) N.add(r); } });
  }
  const out = ast.filter((_, i) => keep[i]); sliceCache.set(ast, out); return out;
}
/* request.security_lower_tf: pide las velas menores (la app las descarga), corre la expresión en ellas y devuelve, en cada vela del gráfico,
   el array con los valores de sus velas menores (tupla → una tupla de arrays). Sin velas menores para una vela vieja → array vacío, como en TradingView. */
function evSecurityLTF(n, env) {
  const ctx = env.ctx, A = {}, names = ['symbol', 'timeframe', 'expression', 'ignore_invalid_symbol', 'currency', 'ignore_invalid_timeframe', 'calc_bars_count']; let pos = 0;
  for (const a of n.args) A[a.name || names[pos++]] = a;
  if (!A.symbol || !A.timeframe || !A.expression) throw new PineError('request.security_lower_tf() necesita símbolo, temporalidad y expresión', n.line);
  const tw = (e => { if (e.k === 'tup') return e.items.length; if (e.k === 'call' && e.fn.k === 'id' && ctx.fns.has(e.fn.name)) { const b = ctx.fns.get(e.fn.name).body, l = b[b.length - 1]; if (l && l.k === 'expr' && l.e.k === 'tup') return l.e.items.length; } return 0; })(A.expression.e);
  const isTup = tw > 0, width = tw; // [a, b] = request.security_lower_tf(…, [x, y]) o (…, f()) donde f devuelve una tupla
  const empty = () => isTup ? new Tup(Array.from({length: width}, () => [])) : [];
  let sym = ev(A.symbol.e, env); const tf = ev(A.timeframe.e, env);
  const sk = isna(sym) || sym === '' ? {key: ctx.symKey || ctx.symbol, sym: ctx.symbol, src: ctx.exch || 'binance'} : secKey(sym, ctx.exch), tfk = tfKey(tf, ctx);
  const one = () => { const v = ev(A.expression.e, env); return v instanceof Tup ? new Tup(v.a.map(x => isna(x) ? [] : [x])) : isna(v) ? [] : [v]; };
  if (!sk || !tfk) { if (!ctx.secondary) warn(ctx, n.line, `request.security_lower_tf(${sym}, ${tf}): símbolo o temporalidad no soportados; se usa la vela del gráfico`, 'sltf:' + sym + tf, 'fix'); return ctx.secondary ? null : one(); }
  const key = sk.key + '|' + tfk, same = (sk.key === (ctx.symKey || ctx.symbol) || (sk.src === (ctx.exch || 'binance') && sk.sym.replace(/[-_]/g, '') === String(ctx.symbol).replace(/[-_]/g, ''))) && tfk === ctx.interval;
  if (ctx.secondary) { if (!same) return null; const v = ev(A.expression.e, env); let r = ctx.rec.get(n); if (!r) ctx.rec.set(n, r = []); r[ctx.bar] = v; return empty(); }
  if (same || tfms(tfk) >= ctx.ms) return one(); // misma temporalidad (o mayor): la vela del gráfico
  const data = ctx.opts.sec && ctx.opts.sec[key];
  if (!data) { (ctx.needs || (ctx.needs = new Map())).set(key, {symbol: sk.key, interval: tfk}); ctx.incomplete = true; return empty(); }
  if (!data.length) { warn(ctx, n.line, `No se pudieron obtener velas de ${sk.key} en ${tfk}: arrays vacíos`, 'secfail:' + key, 'unsupported'); return empty(); }
  let run = ctx.secRuns.get('ltf|' + key);
  if (!run) { run = runSecondary(ctx, sk.key, tfk, key, data); const lo = new Int32Array(ctx.n), hi = new Int32Array(ctx.n); let j = 0;
    for (let i = 0; i < ctx.n; i++) { const t0 = ctx.candles[i].t, t1 = t0 + ctx.ms; while (j < data.length && data[j].t < t0) j++; lo[i] = j; let k = j; while (k < data.length && data[k].t < t1) k++; hi[i] = k; }
    run.lo = lo; run.hi = hi; ctx.secRuns.set('ltf|' + key, run); }
  const rec = run.rec.get(n); if (!rec) return empty();
  const a = run.lo[ctx.bar], b = run.hi[ctx.bar];
  if (!isTup) { const out = []; for (let k = a; k < b; k++) if (rec[k] !== undefined && !isna(rec[k])) out.push(rec[k]); return out; }
  const cols = Array.from({length: width}, () => []);
  for (let k = a; k < b; k++) { const v = rec[k]; if (v instanceof Tup) v.a.forEach((x, q) => { if (q < width) cols[q].push(x); }); }
  return new Tup(cols);
}
function runSecondary(parent, sym, tfk, key, data) {
  const c2 = {candles: data, n: data.length, bar: 0, steps: 0, deadline: parent.deadline, warnings: [], wkeys: new Set(), fns: parent.fns, types: parent.types, enums: parent.enums, methods: parent.methods, frames: new Map(), frameList: [], depth: 0, ctrl: null,
    legacy: parent.legacy, v6: parent.v6, incomplete: false, interval: tfk, symbol: String(sym).split('@')[0], exch: String(sym).split('@')[1] || 'binance', symKey: sym, mintick: parent.mintick, ms: tfms(tfk), opts: {inputs: parent.opts.inputs}, pal: new Map(), out: freshOut(), secondary: true, rec: new Map(), secRuns: new Map(), ast: parent.ast};
  loopProgram(sliceForSecurity(parent.ast), c2);
  const j = new Int32Array(parent.n); let k = -1;
  for (let i = 0; i < parent.n; i++) { const t = parent.candles[i].t; while (k + 1 < data.length && data[k + 1].t <= t) k++; j[i] = k; }
  return {rec: c2.rec, j};
}
function run(code, candles, opts) {
  const t0 = Date.now(); opts = opts || {};
  if (!Array.isArray(candles) || !candles.length) return {ok: false, error: {msg: 'No hay velas cargadas', line: 0}};
  code = String(code || ''); if (code.length > 600000) return {ok: false, error: {msg: 'El script es demasiado grande', line: 0}};
  const san = sanitize(code); code = san.code;
  let ast; try { ast = parse(lex(code)); } catch (e) { if (e.pine) return {ok: false, error: {msg: e.message, line: e.line}}; throw e; }
  curMintick = opts.mintick || 0.01;
  const n = candles.length, vm = /\/\/\s*@version\s*=\s*(\d+)/.exec(code), version = vm ? +vm[1] : 5;
  const iv = opts.interval || '1h', ms = (TF_MIN[iv] || (n > 1 ? (candles[n - 1].t - candles[0].t) / (n - 1) / 60000 : 60)) * 60000;
  const ctx = {candles, n, bar: 0, steps: 0, deadline: t0 + (opts.timeLimitMs || 8000), warnings: [], wkeys: new Set(), fns: new Map(), types: new Map(), methods: new Map(), frames: new Map(), frameList: [], depth: 0, ctrl: null,
    legacy: version < 5, v6: version >= 6, incomplete: false, interval: iv, symbol: opts.symbol || 'BTCUSDT', exch: opts.exch || 'binance', symKey: opts.symKey || '', mintick: opts.mintick || 0.01, ms, opts, pal: new Map(),
    out: {meta: {kind: 'indicator', title: opts.name || 'Script', overlay: false}, plots: [], hlines: [], fills: [], bgcolors: [], barcolors: [], shapes: [], labels: [], lines: [], boxes: [], inputs: [], palette: [], _p: {}}};
  ctx.out.labels.__n = 'l'; ctx.out.lines.__n = 'n'; ctx.out.boxes.__n = 'b'; ctx.out.polylines = Object.assign([], {__n: 'p'}); ctx.out.tables = []; ctx.out.candles = []; ctx.out.linefills = [];
  for (const f of san.fixes) ctx.warnings.push({line: f.line, level: 'fix', msg: 'Reparado automáticamente: ' + f.msg});
  if (version < 5) ctx.warnings.push({line: 0, level: 'info', msg: `Script de la versión ${version}: se acepta la sintaxis antigua (study, sma, security…) sin prefijos; revisa el resultado`});
  analyze(ast, ctx);
  if (ctx.legacyUsed) ctx.warnings.push({line: 0, level: 'fix', msg: 'Convertido de sintaxis antigua: ' + [...ctx.legacyUsed].map(([a, b]) => `${a}() → ${b}()`).join(', ')});
  ctx.ast = ast; ctx.secRuns = new Map();
  try { loopProgram(ast, ctx); } catch (e) {
    if (e.pine) return {ok: false, error: {msg: e.message, line: e.line, bar: ctx.bar}, warnings: ctx.warnings};
    if (e instanceof RangeError) return {ok: false, error: {msg: 'El script usa demasiada memoria o recursión', line: 0}, warnings: ctx.warnings};
    throw e;
  }
  const o = ctx.out, xi = (x, loc) => loc === 'bar_time' ? timeToIndex(ctx, x) : (isna(x) ? null : x);
  const plots = o.plots.map(p => { const u = uniform(p.ci); const r = {id: p.id, title: p.title, style: p.style, lw: p.lw, offset: p.offset, hidden: p.hidden, histbase: p.histbase, force: p.force, values: p.values}; if (u !== undefined) r.cc = u; else r.ci = p.ci; return r; });
  const fills = o.fills.map(f => { const u = uniform(f.ci); const r = {a: f.a, b: f.b, hidden: f.hidden}; if (u !== undefined) r.cc = u; else r.ci = f.ci; return r; });
  const labels = o.labels.filter(l => !l.deleted).map(l => ({x: xi(l.x, l.xloc), y: l.y, text: l.text, yloc: l.yloc, ci: l.ci, style: l.style, tci: l.tci, size: l.size}));
  const lines = o.lines.filter(l => !l.deleted).map(l => ({x1: xi(l.x1, l.xloc), y1: l.y1, x2: xi(l.x2, l.xloc), y2: l.y2, extend: l.extend, ci: l.ci, style: l.style, w: l.w}));
  const boxes = o.boxes.filter(b => !b.deleted).map(b => ({l: xi(b.l, b.xloc), t: b.t, r: xi(b.r, b.xloc), b: b.b, extend: b.extend, bci: b.bci, bw: b.bw, bstyle: b.bstyle, fci: b.fci, text: b.text, tci: b.tci, tz: b.tz, th: b.th, tv: b.tv}));
  const polylines = o.polylines.filter(q => !q.deleted).map(q => ({pts: q.pts.map(pt => [pt.i !== null && q.xloc !== 'bar_time' ? pt.i : (pt.t !== null ? timeToIndex(ctx, pt.t) : pt.i), pt.p]), closed: q.closed, lci: q.lci, fci: q.fci, style: q.style, w: q.w}));
  const tables = o.tables.filter(t => !t.deleted).map(t => ({pos: t.pos, cols: t.cols, rows: t.rows, bci: t.bci, frame: t.frame, fw: t.fw, border: t.border, bw: t.bw, cells: [...t.cells.values()]}));
  const linefills = o.linefills.filter(f => !f.deleted && f.l1 && f.l2 && !f.l1.deleted && !f.l2.deleted).map(f => ({a: [f.l1.x1, f.l1.y1, f.l1.x2, f.l1.y2], b: [f.l2.x1, f.l2.y1, f.l2.x2, f.l2.y2], ci: f.ci}));
  return {ok: true, version, meta: o.meta, polylines, tables, candles: o.candles, linefills, inputs: o.inputs, plots, hlines: o.hlines, fills, bgcolors: o.bgcolors, barcolors: o.barcolors, shapes: o.shapes, labelLog: o.labelLog || null, strategy: ctx.broker ? ctx.broker.result(ctx.candles) : null, alerts: (o.alerts || []).map(s => ({kind: s.kind, title: s.title, message: s.message, bars: s.bars, msgs: s.msgs})), labels, lines, boxes, palette: o.palette,
    warnings: ctx.warnings, needs: ctx.needs ? [...ctx.needs.values()] : [], complete: !ctx.incomplete, stats: {bars: n, ms: Date.now() - t0, steps: ctx.steps}};
}

return {run, lex, parse, PineError, supported: () => Object.keys(B).sort()};
});
