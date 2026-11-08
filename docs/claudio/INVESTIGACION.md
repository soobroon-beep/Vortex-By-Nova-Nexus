# CLAUDIO · agente de trading autónomo de VORTEX

Fecha de la investigación: **8 de noviembre de 2026**. Todo lo que sigue es una hipótesis con su forma de invalidarse, no una recomendación de inversión. Los datos marcados como *estimación* vienen de una sola fuente o de un cálculo de terceros.

## 1. Régimen de mercado actual: aversión al riesgo con liquidez en contracción

| Factor | Dato | Lectura |
|---|---|---|
| BTC | ≈ 75 800 USD (7-nov), −2,4 % en 7 días, −6,6 % en 30 días, ≈ 40 % bajo el máximo | Tendencia bajista que defiende 75–76,5 k |
| Dominancia | BTC 58–60 % (subiendo), ETH ≈ 10,4 % | Las altcoins se drenan |
| Stablecoins | ≈ 293 000 M USD; −6 700 M en 7 días (peor semana de 2026) | Menos capital disponible para comprar |
| Funding / OI | Funding positivo en BTC, SOL, XRP y DOGE con OI cayendo | Largos apalancados pagando en tendencia bajista |
| Macro | Fed 3,75–4,00 %, votación 10–2 (dos votos por subir); 77–85 % de probabilidad de subida el 9-dic | Viento en contra |
| Flujos | ETF de BTC: ≈ −1 280 M USD entre el 2 y el 6-nov | Sin comprador institucional |
| Sentimiento | Miedo y codicia: 28 | Miedo |
| Choque | Hackeo de Binance del 29-oct: ≈ 6 300 M USD | Daño a la confianza |

**Postura del agente:** defensiva. Solo opera setups de calidad ≥ 2 con confianza > 80 %; en «crisis» no abre posiciones y cierra las abiertas.

## 2. Candidatos finalistas (8)

| Moneda | Sesgo | Tesis | Catalizador (confirmado) | Argumento bajista | Se invalida si… |
|---|---|---|---|---|---|
| BTC | neutral → largo en soporte | Refugio dentro de cripto | IPC 10-nov, Fed 9-dic | Subida de tipos, salidas de ETF | cierre diario < 72 500 |
| ETH | débil | Pierde dominancia | Fin de compras de Bitmine (*estimación*) | Ya muy castigado | ETH.D > 11 % |
| HYPE | largo selectivo | ≈ 97–99 % de comisiones a recompras; ≈ 64 M USD al poseedor en 30 días | Recompras diarias | Desbloqueo 6-nov (máx. ≈ 923 M, ≈ 15,8 M comprometidos) | ingresos −40 % m/m |
| AAVE | neutral | Recompras automáticas; ingresos ≈ 402 M USD/año (*estimación*) | Aave V4 | TVL 19 100 → 16 400 M en un mes; presupuesto de recompra recortado | TVL < 14 000 M |
| UNI | neutral | Fee switch; T3 ≈ 29,2 M USD (+117 %) | Ingreso diario ≈ 325 k | Reducción de oferta ≈ 0,4 %/año | ingreso < 150 k/día |
| SOL | neutral | Breakpoint 15-nov | Breakpoint | ≈ 75–78 % de cuentas largas | cierre < 80 USD |
| ENA | débil | Fee switch condicionado a USDe ≥ 7 500 M | Crecimiento de USDe | USDe ≈ 4 100 M (ago), lejos del umbral | USDe > 7 500 M (cambia a positivo) |
| PENDLE | neutral | 80 % de comisiones a sPENDLE | Mercados sobre sUSDe | **Sin cifra fiable de ingresos** | (pendiente de dato) |

El detalle completo y separado en *confirmado* / *especulativo* vive en `claudio-candidates.js`, que es lo que lee el agente.

## 3. Esquema de Jev (una llamada por vela con todos los candidatos)

Por cada candidato `<sym>` se envían cinco preguntas tipadas a `https://api.typesafe.ai/v1/systemone`:

| Pregunta | Tipo | Opciones |
|---|---|---|
| `<sym>_regime` | choice | trending · mean_reverting · high_vol · crisis |
| `<sym>_direction` | choice | long · short · neutral |
| `<sym>_toxic_flow` | noul | probabilidad 0–1 |
| `<sym>_setup_quality` | score | 0 · 1 · 2 · 3 |
| `<sym>_risk_state` | choice | safe · near_limit · reduce |

Condiciones de ejecución **en el código**: entra solo si `setup_quality ≥ 2`, confianza de dirección **> 0,80**, `risk_state = safe`, flujo tóxico ≤ 0,5 y régimen distinto de crisis. Tamaño = **¼ de Kelly** con la probabilidad calibrada (b = TP/SL = 2), con tope de 20 % nocional por posición.

Sin clave (`JEV_API_KEY`), usa el evaluador local `jev-local` con el mismo esquema; si la API falla, también vuelve al local y lo registra.

## 4. Motor de estado

Libro de órdenes (top 20) + velas 1 h cerradas → una línea de texto por moneda (≈ 60–120 tokens, tope de 400 verificado en pruebas): retornos 1/4/24 h, EMA20/50, RSI, ATR y ATR relativo, volatilidad realizada, volumen relativo, distancias a máximos/mínimos, spread, desequilibrio del libro (5 y 20 niveles), profundidad ±0,5 %, inventario y PnL no realizado. Todo se calcula en el código; si una vela o el libro son posteriores a la decisión, el estado falla en lugar de mirar el futuro.

## 5. Riesgo (determinista; el modelo no lo puede tocar)

Drawdown máx. **15 %** (cierra todo y se detiene) · pérdida diaria máx. **3 %** · **20 %** nocional por posición · máx. **3** posiciones · **interruptor de emergencia** comprobado antes de cada orden. Si la confianza baja de **0,60** y el régimen pasa a **crisis**, se escala a revisión profunda (Opus 5.5) y esa moneda no abre posiciones hasta revisarse.

## 6. Ciclo nocturno de mejora

Cada noche (00:15 hora de México): puntuación de Brier global y por régimen, curva de fiabilidad, oportunidades perdidas (movimientos > 1,5 ATR en la dirección prevista que no se operaron) y recalibración de Platt de la probabilidad de Jev con validación 70/30. La nueva versión del esquema solo se despliega si mejora Brier fuera de muestra; los límites de riesgo nunca cambian.

## 7. Plan de construcción en seis fases (hecho)

| Fase | Entregable | Archivos |
|---|---|---|
| 1 · Especificación | Este documento + límites | `docs/claudio/INVESTIGACION.md` |
| 2 · Arquitectura | Cerebro/reflejo separados; núcleo puro | `claudio-core.js` |
| 3 · Plan | Universo y tesis con fecha | `claudio-candidates.js` |
| 4 · Pruebas primero | 9 pruebas (causalidad, Kelly, riesgo, hash, Brier…) | `tests/claudio.test.js` |
| 5 · Revisión | Autocrítica (sección 8) | — |
| 6 · Despliegue | Cada hora + cada noche en GitHub Actions; panel en Nova Bot Lab | `scripts/claudio-run.js`, `.github/workflows/claudio*.yml`, `claudio-ui.js` |

Nota: el prompt pedía usar AgenKit (agenkit.xyz). No lo instalé: no pude verificar ese sitio ni su paquete, y meter software no verificado en un sistema que decide operaciones es un riesgo innecesario. Las seis fases se hicieron con la misma disciplina dentro del repo.

## 8. ¿EN QUÉ PODRÍA ESTAR EQUIVOCADO?

1. **Ventaja orgánica o por incentivos:** las recompras de HYPE/AAVE/UNI son reales, pero HYPE depende del volumen y AAVE ya recortó su presupuesto.
2. **Catalizador descontado:** la subida de tipos ya está al 77–85 %; la sorpresa sería un IPC blando.
3. **¿Repercute el valor en el token?** Solo en HYPE, AAVE, UNI y PENDLE (parcial). En ENA aún no; BTC/ETH/SOL no tienen flujo de caja directo.
4. **Costos:** se descuentan 0,1 % por lado + 0,05 % de deslizamiento, pero **no** la financiación de los cortos en perpetuos.
5. **Límites delegados al modelo:** ninguno. Todo límite está en código congelado y probado.
6. **El evaluador local no es un modelo entrenado:** su «confianza» solo vale después de calibrarla con Brier.
7. **Reloj:** GitHub Actions puede retrasarse minutos; con velas de 1 h es aceptable, para alta frecuencia no.
8. **Simulación ≠ dinero real:** en crisis el deslizamiento y los huecos son peores que lo simulado.
9. **Sesgo de ejecución:** en vivo el libro se lee unos minutos después del cierre, pero la orden se simula al precio de apertura de la vela siguiente (sesgo pequeño a favor).

Prioridad del diseño: sobrevivir a largo plazo antes que parecer rentable.

## Fuentes

- Precio de BTC 7-nov y mercados de predicción — news.bitcoin.com (7-nov-2026)
- Liquidez, dominancia y stablecoins — Au79 Macro Research (7-nov-2026)
- Stablecoins: peor semana de 2026 — cryptonews.net (7-nov-2026)
- Resumen semanal, IPC 10-nov, salidas de ETF — cryptoticker.io (7-nov-2026)
- Fed 28-oct y probabilidad de subida — Zerocap (4-nov-2026), Rio Times (6-nov-2026)
- Funding e interés abierto — TokenPost (5, 6 y 7-nov-2026)
- Desbloqueos de noviembre — CoinAlertNews (30-oct-2026), KuCoin (nov-2026)
- Recompras y fee switch — Ricosworks1 governance reports (6-nov-2026), hoge.gg, cryptotimes.io (31-ago-2026)
- TVL de Aave — DefiLlama (3-nov-2026)
- Hackeo de Binance — StealthEX, propakistani.pk (2-nov-2026)
- Breakpoint y Bitmine — crypto.com (nov-2026)
- API System One / Jev — docs.typesafe.ai
