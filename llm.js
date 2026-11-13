/* VORTEX · IA generativa con modelos ABIERTOS y gratuitos (sin claves de Claude/OpenAI).
   Un solo punto de entrada, chat(messages, opts), con tres proveedores intercambiables:
   · free   — servicio gratuito sin clave (Pollinations, API compatible con OpenAI) con modelos abiertos (Mistral, Llama, Qwen, DeepSeek…).
   · compat — cualquier servidor compatible con OpenAI: Ollama / LM Studio en tu computadora (gratis y privado) o un servicio con plan gratuito (Groq, OpenRouter, Gemini…).
   · webllm — el modelo corre DENTRO del navegador (WebLLM + WebGPU): gratis, privado y sin servidor, pero pesado de descargar.
   Si no hay conexión o el proveedor falla, la interfaz cae al analista local de reglas (ai.js). Las funciones puras se prueban en tests/llm.test.js. */
(function (root) {
  'use strict';
  const KEY = 'cct_llm_v1', FREE_URL = 'https://text.pollinations.ai/openai', FREE_MODELS = 'https://text.pollinations.ai/models';
  const VX = 'https://vortex-push.soobroon.workers.dev'; // tu servidor VORTEX: reenvía las consultas a Pollinations con la clave de la app
  const POLLEN_KEY = 'sk_1XvEYtOmiFixsgMve0FAqQz5ghhy7FFT'; // clave de la app (Pollinations, gratuita): nadie tiene que escribir claves para usar la IA
  const GEN_URL = 'https://gen.pollinations.ai/v1/chat/completions', GEN_MODELS = 'https://gen.pollinations.ai/text/models'; // API nueva de Pollinations (con clave de app pk_ gratuita)
  const WEBLLM_CDN = 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.79/+esm';
  const WEBLLM_MODELS = {text: 'Qwen2.5-3B-Instruct-q4f16_1-MLC', code: 'Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC', vision: 'Phi-3.5-vision-instruct-q4f16_1-MLC'};
  const OPEN = /mistral|llama|qwen|deepseek|gemma|phi|glm|gpt-oss|kimi|olmo|nemotron|smol|minimax/i;
  const VISION = /vision|(^|[-_:\s])vl([-_:\s]|$)|llava|pixtral|gemma-?3|mistral(-(small|medium|large))?$|llama-?4|llama-3\.2-(11|90)|minicpm-v|molmo|internvl|moondream|qwen.*vl|gpt-4o|gemini/i;
  const FALLBACK_FREE = ['mistral', 'llama', 'qwen-coder', 'deepseek'];
  const DEF = {provider: 'free', lab: 'free', compat: {url: 'http://localhost:11434/v1', key: '', model: 'qwen2.5vl:7b', vision: true}};

  class LLMError extends Error { constructor(msg, kind, status) { super(msg); this.kind = kind || 'other'; this.status = status || 0; } }
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } }, lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} };

  /* ───────── Ajustes ───────── */
  function load() {
    let o = {}; try { o = JSON.parse(lsGet(KEY) || '{}') || {}; } catch {}
    const c = o.compat || {}, ok = x => ['free', 'compat', 'webllm'].includes(x);
    let provider = ok(o.provider) ? o.provider : DEF.provider, lab = ok(o.lab) ? o.lab : null;
    if (!lab) { lab = provider === 'compat' ? 'compat' : DEF.lab; if (provider === 'webllm') provider = 'free'; }
    /* El modelo dentro del navegador descarga cientos de MB (la IA parecía «no hacer nada»): solo se usa si lo eliges tú en Ajustes después de este cambio.
       Configuraciones guardadas antes con 'webllm' (era el valor por defecto) pasan a tu servidor VORTEX. */
    if (o.webllmOptIn !== true) { if (lab === 'webllm') lab = 'free'; if (provider === 'webllm') provider = 'free'; }
    if (provider === 'compat' && !(o.compat && o.compat.url)) { provider = 'free'; if (lab === 'compat') lab = 'free'; } // servidor sin configurar → tu servidor VORTEX
    return {provider, lab, webllmOptIn: o.webllmOptIn === true, pkey: /^(pk|sk)_[\w-]{6,}$/.test(String(o.pkey || '').trim()) ? String(o.pkey).trim() : '', compat: {url: String(c.url || DEF.compat.url).trim(), key: String(c.key || ''), model: String(c.model || DEF.compat.model).trim(), vision: c.vision !== false}};
  }
  const save = cfg => lsSet(KEY, JSON.stringify(cfg));

  /* ───────── Funciones puras ───────── */
  const hasImage = msgs => msgs.some(m => Array.isArray(m.content) && m.content.some(p => p && p.type === 'image_url'));
  function stripImages(msgs) { // quita las imágenes y avisa al modelo de que solo cuenta con los datos numéricos
    return msgs.map(m => Array.isArray(m.content) ? {role: m.role, content: m.content.filter(p => p.type !== 'image_url').map(p => p.text).join('\n') + '\n(Nota: la captura del gráfico no pudo enviarse a este modelo; basa tu análisis solo en los datos numéricos.)'} : m);
  }
  const imageMessage = (text, dataUrl) => ({role: 'user', content: [{type: 'text', text}, {type: 'image_url', image_url: {url: dataUrl}}]});
  const supportsVision = (name, meta) => !!(meta && meta.vision === true) || (!(meta && meta.vision === false) && VISION.test(String(name || '')));
  function pickFree(list, o) { // modelos abiertos del servicio gratuito, en orden de preferencia para la tarea
    o = o || {}; const arr = (Array.isArray(list) ? list : []).map(x => typeof x === 'string' ? {name: x} : x).filter(x => x && x.name);
    if (!arr.length) return FALLBACK_FREE.slice();
    let open = arr.filter(x => OPEN.test(x.name) && !/guard|moderat|safety|embed|rerank|audio|tts|whisper|transcri|speech/i.test(x.name + ' ' + (x.description || ''))); if (!open.length) open = arr.filter(x => !/guard|moderat|safety|embed|audio/i.test(x.name));
    const score = x => { let s = 0; const v = supportsVision(x.name, x); if (o.needVision) s += v ? 100 : 0;
      if (o.code) s += /coder|qwen|deepseek/i.test(x.name) ? 50 : 0; else s += /mistral|llama|qwen|gemma/i.test(x.name) ? 20 : 0;
      if (/uncensored|roblox|unity|midijourney|rtist/i.test(x.name + ' ' + (x.description || ''))) s -= 200; return s - (x.name.length / 100); };
    return open.map(x => [x.name, score(x)]).sort((a, b) => b[1] - a[1]).map(x => x[0]);
  }
  function extractCode(text) { // el bloque de código Pine de la respuesta (```pine … ```), o el texto completo si ya empieza como Pine
    const t = String(text || ''), m = /```(?:pine(?:script)?|pinescript)?[ \t]*\n([\s\S]*?)```/i.exec(t);
    if (m && /indicator\s*\(|strategy\s*\(|@version/.test(m[1])) return m[1].trim();
    const open = /```(?:pine(?:script)?)?[ \t]*\n([\s\S]*)$/i.exec(t); if (open && /indicator\s*\(|@version/.test(open[1])) return open[1].replace(/```[\s\S]*$/, '').trim(); // bloque sin cerrar (respuesta cortada)
    const i = t.search(/\/\/\s*@version\s*=\s*\d/); if (i >= 0) return t.slice(i).trim();
    return '';
  }
  const stripCode = text => String(text || '').replace(/```[\s\S]*?(```|$)/g, '').trim();
  function applyPatch(code, text) { // aplica bloques «<<<<<<< SEARCH / ======= / >>>>>>> REPLACE» sobre el código actual (solo cambia lo pedido)
    const re = /<{3,}\s*SEARCH[^\n]*\n([\s\S]*?)\n={3,}[^\n]*\n([\s\S]*?)\n?>{3,}\s*REPLACE/g, norm = x => x.split('\n').map(l => l.trim());
    let out = String(code), applied = 0, failed = [], m, found = 0;
    while ((m = re.exec(String(text || '')))) {
      found++; const a = m[1].replace(/^```\w*\n?|\n?```$/g, ''), b = m[2].replace(/^```\w*\n?|\n?```$/g, '');
      if (out.includes(a) && a.trim()) { out = out.replace(a, () => b); applied++; continue; }
      const lines = out.split('\n'), want = norm(a).filter((l, i, arr) => !(i === arr.length - 1 && l === '')), have = lines.map(l => l.trim()); let at = -1;
      for (let i = 0; i + want.length <= have.length && want.length; i++) { let ok = true; for (let j = 0; j < want.length; j++) if (have[i + j] !== want[j]) { ok = false; break; } if (ok) { at = i; break; } }
      if (at >= 0) { lines.splice(at, want.length, ...b.split('\n')); out = lines.join('\n'); applied++; } else failed.push(a.split('\n')[0].slice(0, 80));
    }
    return {code: out, applied, failed, found, changed: out !== String(code)};
  }
  function friendly(e) {
    if (!e) return 'Error desconocido de la IA.';
    if (e.kind === 'network') return 'No hay conexión con el modelo de IA. Revisa tu internet o cambia de proveedor en ⚙.';
    if (e.kind === 'rate') return 'La IA gratuita tiene límite de uso: espera unos 45 segundos e inténtalo otra vez.';
    if (e.kind === 'auth') return 'El servidor rechazó la clave o el permiso. Revisa los datos del proveedor en ⚙.';
    if (e.kind === 'model') return 'El modelo no está disponible en ese servidor. Cambia el nombre del modelo en ⚙.';
    if (e.kind === 'abort') return 'Se canceló o tardó demasiado.';
    return e.message || 'Error de la IA.';
  }
  function kindOf(status) { return status === 429 ? 'rate' : status === 401 || status === 403 ? 'auth' : status === 404 || status === 400 || status === 422 ? 'model' : status >= 500 ? 'server' : 'other'; }
  const textOf = j => { const c = j && j.choices && j.choices[0]; if (!c) return ''; const m = c.message || c.delta || {}; return typeof m.content === 'string' ? m.content : Array.isArray(m.content) ? m.content.map(p => p.text || '').join('') : (c.text || ''); };

  /* ───────── Red ───────── */
  async function fetchT(url, init, ms, outer) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms || 90000);
    if (outer) { if (outer.aborted) ctl.abort(); else outer.addEventListener('abort', () => ctl.abort(), {once: true}); }
    try { return await fetch(url, Object.assign({}, init, {signal: ctl.signal})); }
    catch (e) { throw new LLMError(e && e.name === 'AbortError' ? 'Tiempo agotado' : 'Sin conexión', e && e.name === 'AbortError' ? 'abort' : 'network'); }
    finally { clearTimeout(t); }
  }
  async function readStream(r, onToken, onChunk) { // SSE de la API compatible con OpenAI
    const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '', out = '';
    for (;;) {
      const {done, value} = await rd.read(); if (done) break; if (onChunk) onChunk(); buf += dec.decode(value, {stream: true});
      let i; while ((i = buf.indexOf('\n')) >= 0) {
        const ln = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!ln.startsWith('data:')) continue; const d = ln.slice(5).trim(); if (d === '[DONE]') continue;
        try { const t = textOf(JSON.parse(d)); if (t) { out += t; onToken(out); } } catch {}
      }
    }
    return out;
  }
  async function openaiCall(url, key, model, messages, o) {
    /* Límite total y límite de SILENCIO: antes, si el servidor empezaba a responder y luego se quedaba callado, la app esperaba para siempre
       (el celular se quedaba «trabado»). Ahora se corta y se prueba otro modelo o se usa el análisis local. */
    const body = {model, messages, temperature: o.temperature == null ? .4 : o.temperature, max_tokens: o.maxTokens || 1600, stream: !!o.onToken};
    if (o.newParams) { body.max_completion_tokens = body.max_tokens; delete body.max_tokens; if (/^(o\d|gpt-5)/i.test(model)) delete body.temperature; } if (o.own && /^(o\d|gpt-5|gemini-2\.5|gemini-3)/i.test(model)) { body.reasoning_effort = 'low'; const k = body.max_completion_tokens ? 'max_completion_tokens' : 'max_tokens'; body[k] = Math.round(body[k] * 1.3); } // modelos que «piensan»: sin esto gastaban los tokens pensando y no respondían // OpenAI: modelos nuevos
    if (o.task && /vortex-push/.test(url)) body.task = o.task; // tu servidor elige la IA open source según el uso: chat, vision o code
    const headers = {'content-type': 'application/json'}; if (key) headers.authorization = 'Bearer ' + key;
    const ctl = new AbortController(), kill = () => ctl.abort(); let idle = 0; const total = setTimeout(kill, o.timeout || 60000), bump = () => { clearTimeout(idle); idle = setTimeout(kill, o.idle || 25000); };
    if (o.signal) { if (o.signal.aborted) ctl.abort(); else o.signal.addEventListener('abort', kill, {once: true}); }
    const cut = e => e instanceof LLMError ? e : new LLMError(ctl.signal.aborted ? 'Tiempo agotado' : 'Sin conexión', ctl.signal.aborted ? 'abort' : 'network');
    try {
      bump(); let r; try { r = await fetch(url, {method: 'POST', headers, body: JSON.stringify(body), signal: ctl.signal}); } catch (e) { throw cut(e); }
      if (!r.ok) { let m = ''; try { const j = await r.json(); m = (j.error && (j.error.message || j.error)) || j.message || ''; } catch {} throw new LLMError(String(m || 'Error ' + r.status).slice(0, 200), kindOf(r.status), r.status); }
      const ct = r.headers.get('content-type') || ''; bump();
      let text = '';
      try { if (o.onToken && /event-stream/i.test(ct) && r.body) text = await readStream(r, o.onToken, bump); else { const raw = await r.text(); try { text = textOf(JSON.parse(raw)); } catch { text = raw; } if (text && o.onToken) o.onToken(text); } }
      catch (e) { throw cut(e); }
      text = String(text || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      if (!text) throw new LLMError('El modelo no devolvió texto.', 'server');
      return text;
    } finally { clearTimeout(total); clearTimeout(idle); }
  }

  /* ───────── Proveedor gratuito (Pollinations) ───────── */
  let freeCache = null;
  async function freeModels() {
    if (freeCache && Date.now() - freeCache.t < 30 * 6e4) return freeCache.list;
    try { const r = await fetchT(FREE_MODELS, {}, 6000); if (r.ok) { const j = await r.json(); if (Array.isArray(j) && j.length) { freeCache = {t: Date.now(), list: j}; return j; } } } catch {}
    return freeCache ? freeCache.list : [];
  }
  async function chatFree(messages, o, cfg) {
    const pk = cfg && cfg.pkey, url = pk ? GEN_URL : FREE_URL;
    let list = []; if (pk) { try { const r = await fetchT(GEN_MODELS, {headers: {authorization: 'Bearer ' + pk}}, 6000); if (r.ok) { const j = await r.json(); list = Array.isArray(j) ? j : Array.isArray(j && j.data) ? j.data.map(x => ({name: x.id || x.name, vision: x.vision})) : []; } } catch {} }
    if (!list.length) list = await freeModels();
    const img = hasImage(messages), cand = (pk ? pickVx(list, {needVision: o.needVision || img, code: o.purpose === 'code'}) : pickFree(list, {needVision: o.needVision || img, code: o.purpose === 'code'}).slice(0, 4)), t0 = Date.now(), budget = o.budget || 85000; let last;
    const left = () => budget - (Date.now() - t0);
    for (const m of cand) { // cada modelo tiene su tiempo; si uno se cuelga, se prueba el siguiente (antes la app se quedaba esperando)
      if (left() < 8000 || (o.signal && o.signal.aborted)) break;
      const meta = list.find(x => x && x.name === m), vis = pk ? VX_VISION.has(m) : supportsVision(m, meta);
      try { const text = await openaiCall(url, pk, m, img && !vis ? stripImages(messages) : messages, Object.assign({}, o, {timeout: Math.min(o.timeout || 45000, left())})); if (looksBad(text)) throw new LLMError('Modelo no apto para chat', 'model'); if (noCredit(text)) throw new LLMError('La clave de IA se quedó sin créditos', 'credit'); if (freeLimit(text)) throw new LLMError('Límite del servicio gratis: ' + text.slice(0, 80), 'rate'); return {text, model: m, image: img && vis}; }
      catch (e) { last = e; if (e.kind === 'credit') throw e; if (e.kind === 'network' && !img) throw e; if (o.signal && o.signal.aborted) throw e; if (e.kind === 'rate') await sleep(2000); } // sin créditos: pasa directo al servicio gratis sin clave
    }
    if (img && left() > 10000) { // la captura pudo ser el problema: un intento más solo con los datos
      const m = pickFree(list, {code: o.purpose === 'code'})[0];
      try { const text = await openaiCall(url, pk, m, stripImages(messages), Object.assign({}, o, {timeout: Math.min(40000, left())})); return {text, model: m, image: false}; } catch (e) { last = e; }
    }
    throw last || new LLMError('El servicio gratuito no respondió.', 'server');
  }

  /* Modelos de CHAT confiables de Pollinations (la lista del servicio también trae filtros de seguridad como «qwen3guard», audio,
     imágenes y modelos de pago: si se elegía uno de esos, la IA contestaba «Safety: Safe» o nada). */
  const VX_TEXT = ['openai', 'mistral', 'gemini', 'deepseek', 'openai-fast'], VX_VIS = ['openai', 'gemini', 'openai-fast'], VX_CODE = ['openai', 'qwen-coder', 'deepseek', 'mistral'];
  const VX_VISION = new Set(VX_VIS), NOT_CHAT = /guard|moderat|safety|embed|rerank|audio|tts|whisper|transcri|speech|image|video|vision-only|midijourney|roblox|rtist|unity/i;
  function pickVx(list, o) {
    const pref = o.code ? VX_CODE : o.needVision ? VX_VIS : VX_TEXT, names = new Set(); for (const x of list || []) { names.add(x.name); for (const a of x.aliases || []) names.add(a); }
    const avail = names.size ? pref.filter(m => names.has(m)) : []; return [...new Set([...avail, ...pref])].slice(0, 3);
  }
  const looksBad = t => /^\s*(safety|categories)\s*:/i.test(t) || /^\s*(safe|unsafe)\s*$/i.test(t); // respuesta de un modelo «guardián», no de chat

  /* ───────── IA de tu servidor VORTEX (Pollinations con tu clave, guardada en el Worker) ───────── */
  let vxDown = 0, vxModels = null;
  async function chatVortex(messages, o) {
    if (Date.now() < vxDown) throw new LLMError('Servidor de IA no disponible', 'nokey');
    if (!vxModels || Date.now() - vxModels.t > 30 * 6e4) { try { const r = await fetchT(VX + '/ai/models', {}, 7000); if (r.status === 503) { vxDown = Date.now() + 10 * 6e4; throw new LLMError('El servidor aún no tiene la clave', 'nokey'); } if (r.ok) { const j = await r.json(); const arr = Array.isArray(j) ? j : Array.isArray(j && j.data) ? j.data : []; vxModels = {t: Date.now(), list: arr.map(x => typeof x === 'string' ? {name: x} : {name: x.name || x.id, aliases: Array.isArray(x.aliases) ? x.aliases : [], vision: x.vision === true || (Array.isArray(x.input_modalities) && x.input_modalities.includes('image')), description: x.description})}; } } catch (e) { if (e.kind === 'nokey') throw e; } }
    const list = (vxModels && vxModels.list.length) ? vxModels.list : [];
    const img = hasImage(messages), code = o.purpose === 'code', cand = pickVx(list, {needVision: o.needVision || img, code}), end = o.deadline || (Date.now() + (code ? 150000 : 75000)); let last;
    const left = () => end - Date.now(), say = t => { try { o.onProgress && o.onProgress({text: t}); } catch {} };
    const tryOne = async (m, msgs, cap) => { const text = await openaiCall(VX + '/ai', '', m, msgs, Object.assign({}, o, {task: code ? 'code' : hasImage(msgs) ? 'vision' : 'chat', timeout: Math.max(5000, Math.min(cap, left())), idle: code ? 45000 : 30000})); if (noCredit(text)) { vxDown = Date.now() + 15 * 6e4; throw new LLMError('El servidor de IA se quedó sin créditos', 'credit'); } if (looksBad(text)) throw new LLMError('Modelo no apto para chat', 'model'); return text; };
    for (const [i, m] of cand.entries()) {
      if (left() < 8000 || (o.signal && o.signal.aborted)) break; const vis = VX_VISION.has(m);
      if (i) say('Probando otro modelo de IA…');
      try { const text = await tryOne(m, img && !vis ? stripImages(messages) : messages, code ? 100000 : (img ? 35000 : 45000)); return {text, model: m + ' · servidor VORTEX', image: img && vis}; }
      catch (e) { last = e; if (e.kind === 'credit') break; if (e.status === 503) { vxDown = Date.now() + 10 * 6e4; break; } if (e.kind === 'network') break; if (o.signal && o.signal.aborted) throw e; if (img) break; if (e.kind === 'rate') await sleep(1500); } // con imagen: no insistir, pasar a solo datos
    }
    if (img && left() > 8000 && !(last && (last.status === 503 || last.kind === 'network' || last.kind === 'credit'))) { // la imagen no pasó (modelo sin visión o sin créditos para imágenes): analiza con los datos del gráfico
      say('Analizando con los datos de tu gráfico…');
      for (const m of ['openai', 'mistral']) { if (left() < 6000) break; try { const text = await tryOne(m, stripImages(messages), 40000); return {text, model: m + ' · servidor VORTEX', image: false}; } catch (e) { last = e; if (e.kind === 'network') break; } }
    }
    throw last || new LLMError('El servidor de IA no respondió.', 'server');
  }
  /* ───────── IA dedicada por tarea: «Analizar gráfico» y «Laboratorio de indicadores» ─────────
     Antes las dos usaban la misma IA que Nexus Pixel («openai» por tu servidor) y su lista de respaldo tenía modelos que Pollinations
     ya cobra («mistral», «gemini», «qwen-coder»): esos contestaban con un aviso de «créditos insuficientes» en vez de la respuesta
     y la app se quedaba reintentando. Ahora cada tarea tiene su propia cadena de modelos probados (noviembre 2026), cada intento
     tiene su tiempo máximo y, si uno falla, se pasa al siguiente en segundos. Nexus Pixel NO usa esto (sigue con chatVortex). */
  const TASKS = {
    chart: {models: ['openai', 'gpt-5.4-mini', 'grok-fast'], vision: new Set(['openai', 'gpt-5.4-mini', 'grok-fast']), cap: 50000, idle: 30000, budget: 110000},
    code: {models: ['gpt-5.4-mini', 'grok-fast', 'openai', 'deepseek'], vision: new Set(['gpt-5.4-mini', 'grok-fast', 'openai']), cap: 75000, idle: 40000, budget: 170000}
  };
  const taskOf = p => p === 'vision' || p === 'chart' ? 'chart' : p === 'code' || p === 'lab' ? 'code' : null;
  const freeLimit = t => String(t || '').length < 400 && /free limit reached|per ip|retry after \d+s/i.test(t); // el servicio gratis sin clave contesta así cuando se pide muy seguido
  const noCredit = t => String(t || '').length < 800 && /enough credits|top up|paid pollen|insufficient (balance|credits)|requires? (a )?paid/i.test(t);
  async function chatTask(messages, o, task) {
    const T = TASKS[task], img = hasImage(messages), end = Date.now() + (o.budget || T.budget), left = () => end - Date.now(), errs = [];
    const say = t => { try { o.onProgress && o.onProgress({text: t}); } catch {} };
    const routes = [[VX + '/ai', '', ''], [FREE_URL, '', ' · gratis'], [GEN_URL, POLLEN_KEY, '']]; // 1) tu servidor VORTEX (IA open source: Cloudflare / Groq), 2) servicio gratis sin clave, 3) Pollinations con la clave de la app // 1) Pollinations con la clave de la app, 2) tu servidor VORTEX, 3) servicio gratis sin clave (si la clave se queda sin créditos)
    const one = async (m, msgs) => {
      let last;
      for (const [url, key, tag] of routes) {
        if (left() < 5000 || (o.signal && o.signal.aborted)) break;
        try {
          const text = await openaiCall(url, key, m, msgs, Object.assign({}, o, {task: task === 'code' ? 'code' : img ? 'vision' : 'chat', timeout: Math.max(5000, Math.min(T.cap, left())), idle: T.idle}));
          if (noCredit(text)) throw new LLMError('Sin créditos en esta ruta', 'credit');
          if (freeLimit(text)) throw new LLMError('Límite del servicio gratis', 'rate');
          if (looksBad(text)) throw new LLMError('El modelo ' + m + ' no está disponible gratis ahora', 'model');
          return {text, model: m + tag};
        } catch (e) { last = e; if (o.signal && o.signal.aborted) throw e; if (e.kind === 'model' || e.kind === 'abort') break; } // el modelo no sirve o se tardó: no insistir con él por la otra ruta
      }
      throw last || new LLMError('Sin tiempo', 'abort');
    };
    let n = 0;
    for (const m of T.models) {
      if (left() < 8000 || (o.signal && o.signal.aborted)) break;
      if (n++) say('Probando otra IA…');
      const vis = T.vision.has(m);
      try { const r = await one(m, img && !vis ? stripImages(messages) : messages); return Object.assign(r, {image: img && vis}); }
      catch (e) { errs.push(e); if (o.signal && o.signal.aborted) throw e; if (e.kind === 'rate') await sleep(1200); }
    }
    if (img && left() > 8000) { // la captura pudo ser el problema: un intento más solo con los datos numéricos
      say('Analizando con los datos de tu gráfico…');
      try { const r = await one(T.models[0], stripImages(messages)); return Object.assign(r, {image: false}); } catch (e) { errs.push(e); }
    }
    throw errs.find(e => e.kind === 'network') || errs[errs.length - 1] || new LLMError('La IA no respondió a tiempo.', 'abort');
  }
  async function serverStatus() { try { const r = await fetchT(VX + '/ai/status', {}, 7000); return r.ok ? await r.json() : {ready: false}; } catch { return {ready: false, offline: true}; } }
  async function serverSetKey(key) { const r = await fetchT(VX + '/ai/key', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({key})}, 10000); let j = {}; try { j = await r.json(); } catch {} if (!r.ok) throw new LLMError(j.error || 'Error ' + r.status, 'auth', r.status); vxDown = 0; vxModels = null; return j; }

  /* ───────── Servidor compatible con OpenAI (Ollama, LM Studio, Groq, OpenRouter…) ───────── */
  async function chatCompat(messages, o, cfg) {
    const c = cfg.compat, base = c.url.replace(/\/+$/, ''), url = /\/chat\/completions$/.test(base) ? base : base + '/chat/completions', img = hasImage(messages);
    const text = await openaiCall(url, c.key, c.model, img && !c.vision ? stripImages(messages) : messages, o);
    return {text, model: c.model, image: img && c.vision};
  }

  /* ───────── WebLLM: modelo dentro del navegador ───────── */
  const engines = {}; let webllmLib = null;
  async function chatWebllm(messages, o) {
    if (!root.navigator || !root.navigator.gpu) throw new LLMError('Este navegador no tiene WebGPU, así que no puede correr el modelo local. Usa Chrome/Edge de escritorio o cambia de proveedor.', 'other');
    const img = hasImage(messages), id = img ? WEBLLM_MODELS.vision : o.purpose === 'code' ? WEBLLM_MODELS.code : WEBLLM_MODELS.text;
    if (!webllmLib) { try { webllmLib = await import(WEBLLM_CDN); } catch { throw new LLMError('No se pudo cargar WebLLM (necesita internet la primera vez).', 'network'); } }
    if (!engines[id]) engines[id] = await webllmLib.CreateMLCEngine(id, {initProgressCallback: p => o.onProgress && o.onProgress(p)});
    const eng = engines[id]; let text = '';
    const stream = await eng.chat.completions.create({messages, stream: true, temperature: o.temperature == null ? .4 : o.temperature, max_tokens: o.maxTokens || 1600});
    for await (const ch of stream) { const d = ch.choices && ch.choices[0] && ch.choices[0].delta && ch.choices[0].delta.content; if (d) { text += d; if (o.onToken) o.onToken(text); } }
    text = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim(); if (!text) throw new LLMError('El modelo local no devolvió texto.', 'server');
    return {text, model: id, image: img};
  }

  /* ───────── Tu propia IA (opcional): tu clave de OpenAI, Claude, Gemini, Groq… ─────────
     Si la configuras en Configuración › Cuenta, TODO lo que usa IA en VORTEX (Nexus Pixel, briefing, consejos de bots, Analizar gráfico, Laboratorio)
     la usa primero; si falla o no hay, se usa la IA gratis de VORTEX. La clave se guarda solo en este dispositivo y va directo al proveedor. */
  const OWN_KEY = 'cct_ownai_v1'; let ownPauseUntil = 0, ownFails = 0;
  const OWN = {
    openai: {name: 'OpenAI (ChatGPT)', url: 'https://api.openai.com/v1', model: 'gpt-4o-mini', vision: true, newParams: true, keyHint: 'sk-…', site: 'platform.openai.com/api-keys'},
    anthropic: {name: 'Claude (Anthropic)', url: 'https://api.anthropic.com/v1', model: 'claude-sonnet-5-5', vision: true, native: 'anthropic', keyHint: 'sk-ant-…', site: 'console.anthropic.com'},
    gemini: {name: 'Google Gemini', url: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash', vision: true, keyHint: 'AIza…', site: 'aistudio.google.com/apikey'},
    xai: {name: 'Grok (xAI)', url: 'https://api.x.ai/v1', model: 'grok-3-mini', vision: false, keyHint: 'xai-…', site: 'console.x.ai'},
    deepseek: {name: 'DeepSeek', url: 'https://api.deepseek.com/v1', model: 'deepseek-chat', vision: false, keyHint: 'sk-…', site: 'platform.deepseek.com'},
    mistral: {name: 'Mistral', url: 'https://api.mistral.ai/v1', model: 'mistral-small-latest', vision: false, keyHint: '…', site: 'console.mistral.ai'},
    groq: {name: 'Groq (rápida, plan gratis)', url: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', vision: false, keyHint: 'gsk_…', site: 'console.groq.com/keys'},
    openrouter: {name: 'OpenRouter (muchos modelos)', url: 'https://openrouter.ai/api/v1', model: 'openrouter/auto', vision: true, keyHint: 'sk-or-…', site: 'openrouter.ai/keys'},
    together: {name: 'Together AI', url: 'https://api.together.xyz/v1', model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', vision: false, keyHint: '…', site: 'api.together.xyz'},
    custom: {name: 'Otra compatible con OpenAI', url: '', model: '', vision: false, keyHint: '…', site: ''}
  };
  function ownLoad() { let o = {}; try { o = JSON.parse(lsGet(OWN_KEY) || '{}') || {}; } catch {} const P = OWN[o.provider] ? o.provider : ''; return {on: !!(o.on && P && o.key), provider: P, key: String(o.key || ''), model: String(o.model || (P ? OWN[P].model : '')), url: String(o.url || (P ? OWN[P].url : ''))}; }
  const ownSave = c => lsSet(OWN_KEY, c ? JSON.stringify(c) : null);
  async function ownModels(c) {
    const P = OWN[c.provider]; if (!P || !c.key) return []; const base = String(c.url || P.url).replace(/\/+$/, '');
    const headers = P.native === 'anthropic' ? {'x-api-key': c.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true'} : {authorization: 'Bearer ' + c.key};
    const r = await fetchT(base + '/models', {headers}, 12000); if (!r.ok) { let m = ''; try { const j = await r.json(); m = (j.error && (j.error.message || j.error)) || ''; } catch {} throw new LLMError(String(m || 'Error ' + r.status).slice(0, 160), kindOf(r.status), r.status); }
    const j = await r.json(), arr = Array.isArray(j) ? j : Array.isArray(j.data) ? j.data : Array.isArray(j.models) ? j.models : [];
    return arr.map(x => String(x.id || x.name || '').replace(/^models\//, '')).filter(x => x && !NOT_CHAT.test(x) && !/embedding|dall-e|tts|whisper|davinci|babbage|moderation|search|transcribe|realtime|audio|image/i.test(x)).sort();
  }
  async function anthropicCall(c, messages, o) {
    const sys = messages.filter(m => m.role === 'system').map(m => typeof m.content === 'string' ? m.content : '').join('\n\n');
    const conv = (m) => ({role: m.role === 'assistant' ? 'assistant' : 'user', content: typeof m.content === 'string' ? m.content : (m.content || []).map(p => { if (p.type === 'text') return {type: 'text', text: p.text}; const u = (p.image_url && (p.image_url.url || p.image_url)) || ''; const d = /^data:(image\/[\w+.-]+);base64,(.*)$/.exec(u); return d ? {type: 'image', source: {type: 'base64', media_type: d[1], data: d[2]}} : {type: 'image', source: {type: 'url', url: u}}; })});
    const msgs = messages.filter(m => m.role !== 'system').map(conv); if (!msgs.length || msgs[0].role !== 'user') msgs.unshift({role: 'user', content: '.'});
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), o.timeout || 90000); if (o.signal) o.signal.addEventListener('abort', () => ctl.abort(), {once: true});
    /* Los Claude nuevos piensan antes de responder y ese «pensamiento» se come el límite de tokens: con 1.000 tokens no dejaban texto
       («Tu IA no devolvió texto»). Con esfuerzo bajo responden directo, igual de bien para esto y gastando menos. */
    const sysP = sys ? (sys.length > 3500 ? [{type: 'text', text: sys, cache_control: {type: 'ephemeral'}}] : sys) : undefined, old = /^claude-(?:3|instant)/.test(c.model || '');
    const body = extra => JSON.stringify(Object.assign({model: c.model || OWN.anthropic.model, max_tokens: Math.round((o.maxTokens || 1600) * 1.3), system: sysP, messages: msgs}, old ? {temperature: o.temperature == null ? .4 : o.temperature} : {}, extra));
    const send = async extra => { try { return await fetch(String(c.url || OWN.anthropic.url).replace(/\/+$/, '') + '/messages', {method: 'POST', signal: ctl.signal, headers: {'content-type': 'application/json', 'x-api-key': c.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true'}, body: body(extra)}); } catch (e) { throw new LLMError(ctl.signal.aborted ? 'Tiempo agotado' : 'Sin conexión', ctl.signal.aborted ? 'abort' : 'network'); } };
    try {
      let r = await send(old ? {} : {output_config: {effort: 'low'}}), err = '';
      if (!r.ok) { try { const jj = await r.json(); err = (jj.error && jj.error.message) || ''; } catch {} if (!old && r.status === 400 && /output_config|effort/i.test(err)) { r = await send({}); err = ''; } } // modelo que no acepta «effort»: se pide normal
      if (!r.ok) { if (!err) { try { const jj = await r.json(); err = (jj.error && jj.error.message) || ''; } catch {} } throw new LLMError(String(err || 'Error ' + r.status).slice(0, 200), kindOf(r.status), r.status); }
      const j = await r.json(), text = (j.content || []).filter(x => x.type === 'text').map(x => x.text).join('').trim();
      if (!text) throw new LLMError(j.stop_reason === 'max_tokens' ? 'Tu IA usó todos sus tokens pensando y no alcanzó a responder.' : 'Tu IA no devolvió texto.', 'server');
      if (o.onToken) o.onToken(text); return text;
    } finally { clearTimeout(tm); }
  }
  /* ───────── Ahorro de tokens con TU IA (tu clave la pagas tú) ─────────
     · se mandan solo los últimos 8 mensajes de la conversación y sin espacios de sobra
     · los datos muy largos (velas, JSON del gráfico) se recortan por en medio: se queda lo más reciente y el inicio
     · la captura del gráfico se achica a 1024 px (cuesta ~la mitad y se ve igual de bien)
     · la misma pregunta en 5 min no se vuelve a cobrar (se reutiliza la respuesta)
     · con Claude, las instrucciones del sistema se guardan en caché (las siguientes preguntas cuestan ~10 % de esa parte)
     · Nexus Pixel y el radar usan la IA gratis de VORTEX; todo lo demás (Analizar gráfico, Briefing, Laboratorio, consejos y creación de bots) usa TU IA */
  const ownCache = new Map(), OWN_TTL = 5 * 6e4, CAP = 12000;
  const tidyTxt = t => { t = String(t).replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim(); return t.length > CAP ? t.slice(0, 8000) + '\n…(datos recortados para ahorrar)…\n' + t.slice(-(CAP - 8000)) : t; };
  async function smallImg(url) { // data:image → máx. 1024 px de ancho (JPEG)
    if (typeof document === 'undefined' || !/^data:image\//.test(url)) return url;
    try { const im = new Image(); await new Promise((ok, ko) => { im.onload = ok; im.onerror = ko; im.src = url; }); const k = Math.min(1, 1024 / Math.max(im.width, im.height)); if (k >= 1 && url.length < 400000) return url;
      const cv = document.createElement('canvas'); cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k); cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height); return cv.toDataURL('image/jpeg', .82); } catch { return url; }
  }
  async function slim(messages) {
    const sys = messages.filter(m => m.role === 'system'), rest = messages.filter(m => m.role !== 'system').slice(-8), out = [];
    for (const m of sys.concat(rest)) out.push(typeof m.content === 'string' ? {role: m.role, content: tidyTxt(m.content)} : {role: m.role, content: await Promise.all((m.content || []).map(async p => p.type === 'text' ? {type: 'text', text: tidyTxt(p.text)} : p.type === 'image_url' ? {type: 'image_url', image_url: {url: await smallImg((p.image_url && (p.image_url.url || p.image_url)) || '')}} : p))});
    return out;
  }
  async function chatOwn(messages, o, c) {
    const P = OWN[c.provider], img = hasImage(messages), vis = P.vision || VISION.test(c.model);
    const msgs = await slim(img && !vis ? stripImages(messages) : messages), oo = Object.assign({}, o, {maxTokens: o.maxTokens || 1200});
    const ck = img ? '' : c.provider + '|' + c.model + '|' + JSON.stringify(msgs) + '|' + oo.maxTokens, hit = ck && ownCache.get(ck);
    if (hit && Date.now() - hit.at < OWN_TTL) { if (o.onToken) o.onToken(hit.text); return {text: hit.text, model: c.model + ' · tu IA (misma respuesta, sin costo)', image: false, own: true}; }
    const text = P.native === 'anthropic' ? await anthropicCall(c, msgs, oo) : await openaiCall(String(c.url || P.url).replace(/\/+$/, '') + '/chat/completions', c.key, c.model, msgs, Object.assign({}, oo, {own: true, newParams: !!P.newParams, idle: Math.max(o.idle || 0, 45000)}));
    if (ck) { ownCache.set(ck, {text, at: Date.now()}); if (ownCache.size > 30) ownCache.delete(ownCache.keys().next().value); }
    return {text, model: c.model + ' · tu IA (' + P.name.replace(/\s*\(.*\)$/, '') + ')', image: img && vis, own: true};
  }
  async function ownTest(c) { const r = await chatOwn([{role: 'user', content: 'Responde solo: OK'}], {maxTokens: 20, timeout: 30000}, c); return r.text; }

  /* ───────── Entrada principal ───────── */
  async function chat(messages, o) {
    o = o || {}; const own = o.noOwn ? null : ownLoad();
    if (own && own.on && Date.now() > ownPauseUntil) {
      try { const r = await chatOwn(messages, o, own); ownFails = 0; return r; }
      catch (e) {
        if (o.signal && o.signal.aborted) throw e;
        /* Tu IA falló: se responde con la IA de VORTEX. Si es por saldo/tokens, clave o límite (o falla 2 veces seguidas), se deja de intentar
           un rato para que todo siga rápido; después se vuelve a probar sola. Nada de la app ni de los bots depende de tu IA. */
        const msg = String(e.message || e), noCredit = /credit|billing|balance|quota|insufficient|payment|saldo|exceeded/i.test(msg) || e.status === 402, auth = e.kind === 'auth', rate = e.kind === 'rate';
        ownFails++; const pause = noCredit || auth ? 60 : rate ? 10 : ownFails >= 2 ? 15 : 0;
        if (pause) { ownPauseUntil = Date.now() + pause * 6e4; ownFails = 0; try { root.dispatchEvent && root.dispatchEvent(new CustomEvent('vx-ownai-paused', {detail: {why: noCredit ? 'sin saldo o tokens' : auth ? 'la clave no es válida' : rate ? 'límite de uso' : 'no responde', min: pause}})); } catch {} }
        try { o.onProgress && o.onProgress({text: 'Tu IA no respondió (' + msg.slice(0, 80) + '); uso la IA de VORTEX…'}); } catch {}
      }
    }
    const cfg = o.cfg || load();
    let prov = o.purpose === 'code' ? cfg.lab : cfg.provider; // el Laboratorio (código) puede usar otro proveedor que el resto
    if (prov === 'webllm' && !(root.navigator && root.navigator.gpu)) prov = cfg.provider === 'webllm' ? 'free' : cfg.provider; // sin WebGPU no puede correr en el navegador
    const phone = !!(root.matchMedia && (root.matchMedia('(pointer: coarse)').matches && root.matchMedia('(max-width: 1023px)').matches)); // en el celular el modelo del navegador (GB de descarga) dejaba la IA «trabada»
    if (prov === 'webllm' && phone) prov = cfg.provider === 'webllm' ? 'free' : cfg.provider;
    try {
      if (prov === 'compat') return await chatCompat(messages, o, cfg);
      if (prov === 'webllm') return await chatWebllm(messages, o);
      if (typeof document !== 'undefined' && taskOf(o.purpose)) return await chatTask(messages, o, taskOf(o.purpose)); // Analizar gráfico y Laboratorio: su propia IA
      if (typeof document !== 'undefined') { // en la app (Nexus Pixel, briefing…): 1) tu servidor VORTEX, 2) Pollinations directo con la clave de la app, 3) servicio antiguo sin clave
        const end = Date.now() + (o.purpose === 'code' ? 150000 : 75000), oo = Object.assign({}, o, {deadline: end}); // nunca más de ~75 s (2½ min para código) en total
        let lastE; try { return await chatVortex(messages, oo); } catch (e) { lastE = e; if (o.signal && o.signal.aborted) throw e; }
        if (end - Date.now() > 20000) { try { return await chatFree(messages, Object.assign({}, oo, {budget: end - Date.now()}), Object.assign({}, cfg, {pkey: cfg.pkey || POLLEN_KEY})); } catch (e) { lastE = e; if (o.signal && o.signal.aborted) throw e; } }
        if (end - Date.now() > 20000) return await chatFree(messages, Object.assign({}, oo, {budget: end - Date.now()}), cfg);
        throw lastE || new LLMError('La IA no respondió a tiempo.', 'abort');
      }
      return await chatFree(messages, o, cfg);
    } catch (e) { if (e instanceof LLMError) { e.message = friendly(e) + (e.kind === 'model' || e.kind === 'server' || e.kind === 'other' ? ' (' + String(e.message).slice(0, 120) + ')' : ''); throw e; } throw new LLMError(String(e && e.message || e), 'other'); }
  }
  const providerLabel = cfg => { const ow = ownLoad(); if (ow.on) return 'Tu IA · ' + ow.model; return providerLabelBase(cfg); };
  const providerLabelBase = cfg => (cfg = cfg || load(), cfg.provider === 'compat' ? 'Servidor · ' + cfg.compat.model : cfg.provider === 'webllm' ? 'En tu navegador' : 'Gratis · modelo abierto');

  /* ───────── Guía de Pine para el Laboratorio y métricas de señales ───────── */
  const PINE_GUIDE = `Eres un experto en Pine Script v5. Escribes indicadores para el intérprete propio de VORTEX, que soporta un SUBCONJUNTO de Pine v5.
REGLAS OBLIGATORIAS:
- Empieza con //@version=5 y una sola llamada indicator("Nombre corto", overlay=true|false). Nunca uses strategy().
- Usa solo funciones de Pine v5: ta.* (sma, ema, rma, wma, hma, rsi, macd, stoch, atr, bb, kc, cci, mfi, crossover, crossunder, cross, highest, lowest, pivothigh, pivotlow, stdev, change, cum, vwap, supertrend, dmi, adx, sar, valuewhen, barssince…), math.*, plot, plotshape, plotchar, bgcolor, barcolor, hline, fill, label.new, line.new, box.new, table.new/table.cell, input.int/float/bool/string/color/source, array.*, str.tostring, color.*, nz, na, if/for/while, funciones propias y var.
- Firmas exactas: [macdLine, signalLine, hist] = ta.macd(close, 12, 26, 9) · [diPlus, diMinus, adx] = ta.dmi(14, 14) (también vale adx = ta.adx(14)) · [st, dir] = ta.supertrend(3.0, 10) (dir < 0 = alcista) · [mid, up, lo] = ta.bb(close, 20, 2.0) · k = ta.stoch(close, high, low, 14).
- Cada llamada a una función debe ir COMPLETA en una sola línea (no partas los argumentos en varias líneas). Las tuplas solo con [a, b] = f(...).
- Dibujos (line.new, label.new, box.new) solo dentro de if barstate.islast o guardados en var y actualizados con line.set_xy1/2, label.set_xy… para no crear miles.
- NO uses: import, library, request.security con símbolos raros, request.economic/financial/earnings, alert(), strategy.*, ni funciones inventadas. Si no estás seguro de que una función exista, calcula con operaciones básicas.
- Parámetros editables con input.* (con minval/maxval cuando aplique). Colores con color.new(color.X, transparencia).
- Señales visuales con plotshape (compra: location.belowbar, venta: location.abovebar). Títulos de plot cortos.
- Si el indicador necesita escala distinta al precio (RSI, MACD, volumen…) usa overlay=false; si va sobre las velas, overlay=true.
- Código claro y comentado en español, menos de 140 líneas, sin dependencias externas.
SI RECIBES UNA IMAGEN de referencia (captura de un indicador, boceto o ejemplo), obsérvala: tipo (sobre velas o panel), líneas, colores, señales y niveles, y replica ese estilo con funciones soportadas.
FORMATO DE RESPUESTA: primero 2-4 líneas en español explicando qué hace y cómo leerlo; después UN solo bloque \`\`\`pine con el código completo. Nada más.`;
  function signalMetrics(candles, res) { // qué pasó DESPUÉS de cada señal del indicador (histórico). No es un backtest ni un resultado real
    const out = {bars: candles.length, signals: [], note: 'Estadística descriptiva sobre las velas cargadas: mide cuánto se movió el precio después de cada señal visual (compra = marca bajo la vela, venta = marca sobre la vela). No incluye comisiones, deslizamiento ni gestión de riesgo, y no es un resultado real ni una promesa.'};
    for (const s of (res && res.shapes) || []) {
      const side = s.loc === 'belowbar' ? 1 : s.loc === 'abovebar' ? -1 : 0; if (!side || !s.pts || !s.pts.length) continue;
      const bars = [...new Set(s.pts.map(p => p[0]))].filter(i => i >= 0 && i < candles.length), row = {title: s.title || (side > 0 ? 'Compra' : 'Venta'), side: side > 0 ? 'compra' : 'venta', n: bars.length, h: {}};
      for (const H of [5, 10, 20]) { let ok = 0, tot = 0, sum = 0; for (const i of bars) { if (i + H >= candles.length) continue; const r = (candles[i + H].c - candles[i].c) / candles[i].c * 100 * side; tot++; sum += r; if (r > 0) ok++; } row.h[H] = tot ? {n: tot, hit: +(ok / tot * 100).toFixed(1), avg: +(sum / tot).toFixed(2)} : null; }
      out.signals.push(row);
    }
    return out;
  }

  // Libera el espacio del modelo de navegador (cientos de MB) que se descargaba antes por defecto, si no lo elegiste tú
  try { if (typeof caches !== 'undefined' && typeof document !== 'undefined' && !load().webllmOptIn) setTimeout(() => caches.keys().then(ks => ks.filter(k => /^webllm\//.test(k)).forEach(k => caches.delete(k))).catch(() => {}), 4000); } catch {}
  const api = {OWN, ownLoad, ownSave, ownModels, ownTest, pickVx, looksBad, serverStatus, serverSetKey, resetCache: () => { freeCache = null; }, LLMError, load, save, chat, freeModels, pickFree, supportsVision, imageMessage, hasImage, stripImages, extractCode, stripCode, applyPatch, friendly, providerLabel, PINE_GUIDE, signalMetrics, WEBLLM_MODELS, FREE_URL};
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CCTLLM = api;
})(typeof self !== 'undefined' ? self : this);
