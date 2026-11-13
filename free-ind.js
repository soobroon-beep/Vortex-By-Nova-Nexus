/* Indicadores gratuitos extra (para todos), escritos en Pine y ejecutados por el motor de VORTEX.
   Aparecen en el panel de Indicadores dentro de «Gratuitos», con su categoría. */
(function (root) {
  'use strict';
  root.CCTFree = [
    {id: 'sma', cat: 'trend', col: '#4dd0e1', name: 'SMA', desc: 'Media móvil simple con período y fuente editables', art: 'ema20', code: `//@version=5
indicator("SMA", overlay=true)
len = input.int(50, "Período", minval=1)
src = input.source(close, "Fuente")
col = input.color(#4dd0e1, "Color")
plot(ta.sma(src, len), "SMA", col, 2)
`},
    {id: 'hma', cat: 'trend', col: '#ffb74d', name: 'Media de Hull (HMA)', desc: 'Media muy rápida y suave que reduce el retraso; cambia de color según su pendiente', art: 'ema20', code: `//@version=5
indicator("Media de Hull", "HMA", overlay=true)
len = input.int(55, "Período", minval=2)
src = input.source(close, "Fuente")
h = ta.hma(src, len)
plot(h, "HMA", h > h[1] ? color.new(#26a69a, 0) : color.new(#ef5350, 0), 2)
`},
    {id: 'golden', cat: 'trend', col: '#f5c568', name: 'Cruce dorado / de la muerte', desc: 'SMA 50 y SMA 200 con marca cuando se cruzan (cambio de tendencia de largo plazo)', art: 'cross', code: `//@version=5
indicator("Cruce dorado / de la muerte", "Golden Cross", overlay=true)
f = input.int(50, "Media rápida", minval=1)
s = input.int(200, "Media lenta", minval=2)
a = ta.sma(close, f)
b = ta.sma(close, s)
plot(a, "SMA rápida", color.new(#f5c568, 0), 2)
plot(b, "SMA lenta", color.new(#b58dff, 0), 2)
plotshape(ta.crossover(a, b), "Cruce dorado", shape.labelup, location.belowbar, color.new(#f5c568, 0), text="Dorado", textcolor=color.black, size=size.small)
plotshape(ta.crossunder(a, b), "Cruce de la muerte", shape.labeldown, location.abovebar, color.new(#ef5350, 0), text="Muerte", textcolor=color.white, size=size.small)
`},
    {id: 'pivots', cat: 'struct', col: '#90caf9', name: 'Pivotes diarios (clásicos)', desc: 'Punto pivote, resistencias R1-R3 y soportes S1-S3 del día anterior', art: 'donchian', code: `//@version=5
indicator("Pivotes diarios", "Pivotes", overlay=true)
[ph, pl, pc] = request.security(syminfo.tickerid, "D", [high[1], low[1], close[1]], lookahead=barmerge.lookahead_on)
p = (ph + pl + pc) / 3
r1 = 2 * p - pl
s1 = 2 * p - ph
r2 = p + (ph - pl)
s2 = p - (ph - pl)
r3 = ph + 2 * (p - pl)
s3 = pl - 2 * (ph - p)
nuevo = ta.change(time("D")) != 0
plot(nuevo ? na : p, "P", color.new(#f5c568, 0), 2, plot.style_linebr)
plot(nuevo ? na : r1, "R1", color.new(#ef5350, 20), 1, plot.style_linebr)
plot(nuevo ? na : r2, "R2", color.new(#ef5350, 40), 1, plot.style_linebr)
plot(nuevo ? na : r3, "R3", color.new(#ef5350, 60), 1, plot.style_linebr)
plot(nuevo ? na : s1, "S1", color.new(#26a69a, 20), 1, plot.style_linebr)
plot(nuevo ? na : s2, "S2", color.new(#26a69a, 40), 1, plot.style_linebr)
plot(nuevo ? na : s3, "S3", color.new(#26a69a, 60), 1, plot.style_linebr)
`},
    {id: 'autofib', cat: 'struct', col: '#ffd54f', name: 'Fibonacci automático', desc: 'Retroceso de Fibonacci entre el máximo y el mínimo recientes, un color por nivel; los niveles clave (0.5, 0.618, 0.65, 0.786) y su fondo resaltan más', art: 'patterns', code: `//@version=5
indicator("Fibonacci automático", "Auto Fib", overlay=true, max_lines_count=20, max_labels_count=20, max_boxes_count=12)
lb = input.int(150, "Velas a revisar", minval=20)
fondo = input.bool(true, "Fondo entre niveles")
hi = ta.highest(high, lb)
lo = ta.lowest(low, lb)
hiBar = ta.highestbars(high, lb)
loBar = ta.lowestbars(low, lb)
sube = loBar < hiBar
var lvls = array.from(0.0, 0.236, 0.382, 0.5, 0.618, 0.65, 0.786, 1.0)
var cols = array.from(#787b86, #f23645, #ff9800, #4caf50, #089981, #00bcd4, #2962ff, #787b86)
var vivos = array.from(#9aa1ad, #ff4d5c, #ffa726, #5fe066, #00c9a0, #18e0ff, #4d7dff, #9aa1ad)
var names = array.from("", "", "", " · medio", " · proporción áurea", " · zona dorada", " · retroceso profundo", "")
if barstate.islast
    for i = 0 to array.size(lvls) - 1
        f = array.get(lvls, i)
        y = sube ? hi - (hi - lo) * f : lo + (hi - lo) * f
        clave = f == 0.618 or f == 0.5 or f == 0.786 or f == 0.65
        c = clave ? array.get(vivos, i) : array.get(cols, i)
        if fondo and i < array.size(lvls) - 1
            f2 = array.get(lvls, i + 1)
            y2 = sube ? hi - (hi - lo) * f2 : lo + (hi - lo) * f2
            claveB = clave or f2 == 0.618 or f2 == 0.5 or f2 == 0.786 or f2 == 0.65
            cb = claveB ? array.get(vivos, i + 1) : array.get(cols, i + 1)
            box.new(bar_index - lb, math.max(y, y2), bar_index + 10, math.min(y, y2), border_color=color.new(cb, 100), bgcolor=color.new(cb, clave and (f2 == 0.618 or f2 == 0.5 or f2 == 0.786 or f2 == 0.65) ? 66 : claveB ? 84 : 90))
        line.new(bar_index - lb, y, bar_index + 10, y, color=c, width=f == 0.618 ? 3 : clave ? 2 : 1, style=clave ? line.style_solid : line.style_dashed)
        label.new(bar_index + 10, y, str.tostring(f) + array.get(names, i) + " (" + str.tostring(y, format.mintick) + ")", style=label.style_label_left, color=color.new(color.black, 100), textcolor=c, size=f == 0.618 ? size.normal : size.small)
`},
    {id: 'volma', cat: 'volume', col: '#8294a8', name: 'Volumen con media', desc: 'Volumen por vela en panel propio con su media de 20 y marca cuando hay volumen anormal', art: 'volume', code: `//@version=5
indicator("Volumen con media", "Vol + MA", overlay=false, format=format.volume)
len = input.int(20, "Media", minval=1)
k = input.float(2.0, "Volumen anormal (× media)", minval=1)
m = ta.sma(volume, len)
plot(volume, "Volumen", close >= open ? color.new(#26a69a, 40) : color.new(#ef5350, 40), style=plot.style_columns)
plot(m, "Media", color.new(#f5c568, 0), 2)
plotshape(volume > m * k, "Anormal", shape.circle, location.top, color.new(#f5c568, 0), size=size.tiny)
`},
    {id: 'emaribbon', cat: 'trend', col: '#26c6da', name: 'Cinta de EMAs 9 / 21 / 50 / 200', desc: 'Las cuatro medias más usadas en estrategias, con relleno verde o rojo entre la 9 y la 21 según la tendencia', art: 'cross', code: `//@version=5
indicator("Cinta de EMAs 9 / 21 / 50 / 200", "EMA Ribbon", overlay=true)
a = input.int(9, "EMA 1", minval=1)
b = input.int(21, "EMA 2", minval=1)
c = input.int(50, "EMA 3", minval=1)
d = input.int(200, "EMA 4", minval=1)
e1 = ta.ema(close, a)
e2 = ta.ema(close, b)
e3 = ta.ema(close, c)
e4 = ta.ema(close, d)
p1 = plot(e1, "EMA 1", color.new(#26c6da, 0), 1)
p2 = plot(e2, "EMA 2", color.new(#ffca28, 0), 1)
plot(e3, "EMA 3", color.new(#ab47bc, 0), 2)
plot(e4, "EMA 4", color.new(#ef5350, 0), 2)
fill(p1, p2, e1 > e2 ? color.new(#26a69a, 82) : color.new(#ef5350, 82), "Relleno 9 / 21")
`},
    {id: 'utbot', cat: 'trend', col: '#26a69a', name: 'UT Bot (compra / venta)', desc: 'Stop dinámico con ATR que marca Compra y Venta cuando el precio lo cruza; de los más usados para entradas', art: 'supertrend', code: `//@version=5
indicator("UT Bot (compra / venta)", "UT Bot", overlay=true)
a = input.float(1.0, "Sensibilidad (múltiplo del ATR)", minval=0.1, step=0.1)
c = input.int(10, "Período del ATR", minval=1)
nLoss = a * ta.atr(c)
src = close
var float trail = na
p = nz(trail[1], src)
trail := src > p and src[1] > p ? math.max(p, src - nLoss) : src < p and src[1] < p ? math.min(p, src + nLoss) : src > p ? src - nLoss : src + nLoss
xu = ta.crossover(src, trail)
xd = ta.crossunder(src, trail)
buy = xu and src > trail
sell = xd and src < trail
plot(trail, "Stop dinámico", src > trail ? color.new(#26a69a, 0) : color.new(#ef5350, 0), 1)
plotshape(buy, "Compra", shape.labelup, location.belowbar, color.new(#26a69a, 0), text="Compra", textcolor=color.white, size=size.tiny)
plotshape(sell, "Venta", shape.labeldown, location.abovebar, color.new(#ef5350, 0), text="Venta", textcolor=color.white, size=size.tiny)
`},
    {id: 'chandelier', cat: 'trend', col: '#66bb6a', name: 'Chandelier Exit', desc: 'Stop de salida con ATR desde el máximo o mínimo reciente; cambia de lado y avisa la nueva dirección', art: 'psar', code: `//@version=5
indicator("Chandelier Exit", "CE", overlay=true)
len = input.int(22, "Período del ATR", minval=1)
mult = input.float(3.0, "Múltiplo del ATR", minval=0.1, step=0.1)
atr = mult * ta.atr(len)
var float longStop = na
var float shortStop = na
ls = ta.highest(close, len) - atr
ss = ta.lowest(close, len) + atr
lsp = nz(longStop[1], ls)
ssp = nz(shortStop[1], ss)
longStop := close[1] > lsp ? math.max(ls, lsp) : ls
shortStop := close[1] < ssp ? math.min(ss, ssp) : ss
var int dir = 1
dir := close > ssp ? 1 : close < lsp ? -1 : dir
plot(dir == 1 ? longStop : na, "Stop de largo", color.new(#26a69a, 0), 2, plot.style_linebr)
plot(dir == -1 ? shortStop : na, "Stop de corto", color.new(#ef5350, 0), 2, plot.style_linebr)
plotshape(dir == 1 and dir[1] == -1, "Cambio a largo", shape.labelup, location.belowbar, color.new(#26a69a, 0), text="Largo", textcolor=color.white, size=size.tiny)
plotshape(dir == -1 and dir[1] == 1, "Cambio a corto", shape.labeldown, location.abovebar, color.new(#ef5350, 0), text="Corto", textcolor=color.white, size=size.tiny)
`},
    {id: 'linreg', cat: 'trend', col: '#2962ff', name: 'Canal de regresión lineal', desc: 'Línea de tendencia estadística de las últimas N velas con bandas de desviación arriba y abajo', art: 'keltner', code: `//@version=5
indicator("Canal de regresión lineal", "Regresión", overlay=true, max_lines_count=10)
len = input.int(100, "Velas", minval=10)
k = input.float(2.0, "Desviaciones", minval=0.5, step=0.5)
mid = ta.linreg(close, len, 0)
mid0 = ta.linreg(close, len, len - 1)
dev = ta.stdev(close, len)
var line lm = na
var line lu = na
var line ld = na
if barstate.islast
    line.delete(lm)
    line.delete(lu)
    line.delete(ld)
    lm := line.new(bar_index - len + 1, mid0, bar_index, mid, color=color.new(#2962ff, 0), width=2)
    lu := line.new(bar_index - len + 1, mid0 + k * dev, bar_index, mid + k * dev, color=color.new(#ef5350, 20), style=line.style_dashed)
    ld := line.new(bar_index - len + 1, mid0 - k * dev, bar_index, mid - k * dev, color=color.new(#26a69a, 20), style=line.style_dashed)
`},
    {id: 'squeeze', cat: 'osc', col: '#26a69a', name: 'Squeeze Momentum', desc: 'Detecta la compresión de volatilidad (punto rojo) antes de un movimiento fuerte y su dirección con el histograma', art: 'macd', code: `//@version=5
indicator("Squeeze Momentum", "SQZMOM", overlay=false)
length = input.int(20, "Longitud de Bollinger", minval=1)
mult = input.float(2.0, "Múltiplo de Bollinger", step=0.1)
lengthKC = input.int(20, "Longitud de Keltner", minval=1)
multKC = input.float(1.5, "Múltiplo de Keltner", step=0.1)
basis = ta.sma(close, length)
dev = mult * ta.stdev(close, length)
upperBB = basis + dev
lowerBB = basis - dev
ma = ta.sma(close, lengthKC)
rangema = ta.sma(ta.tr(true), lengthKC)
upperKC = ma + rangema * multKC
lowerKC = ma - rangema * multKC
sqzOn = lowerBB > lowerKC and upperBB < upperKC
sqzOff = lowerBB < lowerKC and upperBB > upperKC
val = ta.linreg(close - math.avg(math.avg(ta.highest(high, lengthKC), ta.lowest(low, lengthKC)), ta.sma(close, lengthKC)), lengthKC, 0)
bcolor = val > 0 ? (val > nz(val[1]) ? color.new(#26a69a, 0) : color.new(#b2dfdb, 0)) : (val < nz(val[1]) ? color.new(#ef5350, 0) : color.new(#ffcdd2, 0))
plot(val, "Momentum", bcolor, 4, plot.style_histogram)
plot(0, "Compresión", sqzOn ? color.new(#ef5350, 0) : sqzOff ? color.new(#26a69a, 0) : color.new(#787b86, 0), 3, plot.style_cross)
`},
    {id: 'wavetrend', cat: 'osc', col: '#26a69a', name: 'WaveTrend', desc: 'Oscilador de LazyBear muy usado: cruces de sus dos líneas en sobrecompra o sobreventa marcan giros', art: 'stochrsi', code: `//@version=5
indicator("WaveTrend", "WT", overlay=false)
n1 = input.int(10, "Longitud del canal", minval=1)
n2 = input.int(21, "Longitud del promedio", minval=1)
ob = input.int(60, "Sobrecompra")
os = input.int(-60, "Sobreventa")
ap = hlc3
esa = ta.ema(ap, n1)
d = ta.ema(math.abs(ap - esa), n1)
ci = (ap - esa) / (0.015 * d)
wt1 = ta.ema(ci, n2)
wt2 = ta.sma(wt1, 4)
hline(0, "Cero", color.new(#787b86, 50))
hline(ob, "Sobrecompra", color.new(#ef5350, 40))
hline(os, "Sobreventa", color.new(#26a69a, 40))
plot(wt1 - wt2, "Diferencia", color.new(#2962ff, 60), style=plot.style_area)
plot(wt1, "WT1", color.new(#26a69a, 0), 2)
plot(wt2, "WT2", color.new(#ef5350, 0), 1)
plotshape(ta.crossover(wt1, wt2) and wt1 < os, "Giro alcista", shape.circle, location.bottom, color.new(#26a69a, 0), size=size.tiny)
plotshape(ta.crossunder(wt1, wt2) and wt1 > ob, "Giro bajista", shape.circle, location.top, color.new(#ef5350, 0), size=size.tiny)
`},
    {id: 'rsidiv', cat: 'osc', col: '#bb9cff', name: 'RSI con divergencias', desc: 'RSI que marca divergencias alcistas y bajistas entre el precio y el oscilador (señal clásica de giro)', art: 'rsi', code: `//@version=5
indicator("RSI con divergencias", "RSI Div", overlay=false)
len = input.int(14, "Período del RSI", minval=2)
lb = input.int(5, "Velas del pivote", minval=2)
r = ta.rsi(close, len)
hline(70, "Sobrecompra", color.new(#ef5350, 50))
hline(50, "Medio", color.new(#787b86, 70))
hline(30, "Sobreventa", color.new(#26a69a, 50))
plot(r, "RSI", color.new(#bb9cff, 0), 2)
ph = ta.pivothigh(r, lb, lb)
pl = ta.pivotlow(r, lb, lb)
rPL = ta.valuewhen(not na(pl), r[lb], 1)
pPL = ta.valuewhen(not na(pl), low[lb], 1)
rPH = ta.valuewhen(not na(ph), r[lb], 1)
pPH = ta.valuewhen(not na(ph), high[lb], 1)
bull = not na(pl) and r[lb] > rPL and low[lb] < pPL
bear = not na(ph) and r[lb] < rPH and high[lb] > pPH
plotshape(bull, "Divergencia alcista", shape.labelup, location.bottom, color.new(#26a69a, 0), offset=-lb, text="Alc", textcolor=color.white, size=size.tiny)
plotshape(bear, "Divergencia bajista", shape.labeldown, location.top, color.new(#ef5350, 0), offset=-lb, text="Baj", textcolor=color.white, size=size.tiny)
`},
    {id: 'vortexi', cat: 'osc', col: '#26a69a', name: 'Vortex Indicator (VI)', desc: 'VI+ y VI−: cuando VI+ cruza arriba de VI− empieza tendencia alcista, y al revés', art: 'adx', code: `//@version=5
indicator("Vortex Indicator", "VI", overlay=false)
len = input.int(14, "Período", minval=2)
vmp = math.sum(math.abs(high - low[1]), len)
vmm = math.sum(math.abs(low - high[1]), len)
trs = math.sum(ta.atr(1), len)
vip = vmp / trs
vim = vmm / trs
hline(1, "Uno", color.new(#787b86, 60))
plot(vip, "VI+", color.new(#26a69a, 0), 2)
plot(vim, "VI−", color.new(#ef5350, 0), 2)
plotshape(ta.crossover(vip, vim), "Cruce alcista", shape.circle, location.bottom, color.new(#26a69a, 0), size=size.tiny)
plotshape(ta.crossunder(vip, vim), "Cruce bajista", shape.circle, location.top, color.new(#ef5350, 0), size=size.tiny)
`},
    {id: 'aroon', cat: 'osc', col: '#ffa726', name: 'Aroon', desc: 'Mide cuántas velas pasaron desde el último máximo y mínimo: detecta el inicio y la fuerza de una tendencia', art: 'adx', code: `//@version=5
indicator("Aroon", overlay=false)
len = input.int(14, "Período", minval=1)
up = 100 * (ta.highestbars(high, len + 1) + len) / len
dn = 100 * (ta.lowestbars(low, len + 1) + len) / len
hline(70, "Fuerte", color.new(#787b86, 50))
hline(30, "Débil", color.new(#787b86, 50))
plot(up, "Aroon arriba", color.new(#26a69a, 0), 2)
plot(dn, "Aroon abajo", color.new(#ef5350, 0), 2)
`},
    {id: 'pdhl', cat: 'struct', col: '#90caf9', name: 'Máximo y mínimo del día y semana anterior', desc: 'Los niveles que más respetan los traders intradía: máximo/mínimo de ayer y de la semana pasada', art: 'donchian', code: `//@version=5
indicator("Máximo y mínimo del día y semana anterior", "PDH / PDL", overlay=true)
showW = input.bool(true, "Mostrar la semana anterior")
pdh = request.security(syminfo.tickerid, "D", high[1], lookahead=barmerge.lookahead_on)
pdl = request.security(syminfo.tickerid, "D", low[1], lookahead=barmerge.lookahead_on)
pwh = request.security(syminfo.tickerid, "W", high[1], lookahead=barmerge.lookahead_on)
pwl = request.security(syminfo.tickerid, "W", low[1], lookahead=barmerge.lookahead_on)
plot(pdh, "Máximo de ayer", color.new(#26a69a, 0), 1, plot.style_linebr)
plot(pdl, "Mínimo de ayer", color.new(#ef5350, 0), 1, plot.style_linebr)
plot(showW ? pwh : na, "Máximo de la semana pasada", color.new(#26a69a, 40), 2, plot.style_linebr)
plot(showW ? pwl : na, "Mínimo de la semana pasada", color.new(#ef5350, 40), 2, plot.style_linebr)
`},
    {id: 'srauto', cat: 'struct', col: '#ef5350', name: 'Soportes y resistencias automáticos', desc: 'Dibuja solo los niveles de los últimos pivotes altos (resistencias) y bajos (soportes)', art: 'dchan', code: `//@version=5
indicator("Soportes y resistencias automáticos", "S / R", overlay=true, max_lines_count=60)
lb = input.int(10, "Fuerza del pivote (velas)", minval=2)
n = input.int(5, "Niveles por lado", minval=1, maxval=20)
ph = ta.pivothigh(high, lb, lb)
pl = ta.pivotlow(low, lb, lb)
var res = array.new_line()
var sup = array.new_line()
if not na(ph)
    array.push(res, line.new(bar_index - lb, ph, bar_index, ph, extend=extend.right, color=color.new(#ef5350, 25), width=1, style=line.style_dashed))
    if array.size(res) > n
        line.delete(array.shift(res))
if not na(pl)
    array.push(sup, line.new(bar_index - lb, pl, bar_index, pl, extend=extend.right, color=color.new(#26a69a, 25), width=1, style=line.style_dashed))
    if array.size(sup) > n
        line.delete(array.shift(sup))
`},
    {id: 'zigzag', cat: 'struct', col: '#f5c568', name: 'ZigZag', desc: 'Une los máximos y mínimos importantes para ver la estructura del mercado (altos y bajos más altos o más bajos)', art: 'patterns', code: `//@version=5
indicator("ZigZag", overlay=true, max_lines_count=300)
dev = input.int(10, "Profundidad (velas)", minval=2)
col = input.color(#f5c568, "Color")
ph = ta.pivothigh(high, dev, dev)
pl = ta.pivotlow(low, dev, dev)
var float lp = na
var int lx = na
var float pp = na
var int px = na
var int ld = 0
var line cur = na
if not na(ph)
    if ld == 1
        if ph > lp
            line.delete(cur)
            cur := na(pp) ? na : line.new(px, pp, bar_index - dev, ph, color=col, width=2)
            lp := ph
            lx := bar_index - dev
    else
        pp := lp
        px := lx
        cur := na(lp) ? na : line.new(lx, lp, bar_index - dev, ph, color=col, width=2)
        lp := ph
        lx := bar_index - dev
        ld := 1
if not na(pl)
    if ld == -1
        if pl < lp
            line.delete(cur)
            cur := na(pp) ? na : line.new(px, pp, bar_index - dev, pl, color=col, width=2)
            lp := pl
            lx := bar_index - dev
    else
        pp := lp
        px := lx
        cur := na(lp) ? na : line.new(lx, lp, bar_index - dev, pl, color=col, width=2)
        lp := pl
        lx := bar_index - dev
        ld := -1
`},
    {id: 'fractals', cat: 'struct', col: '#b58dff', name: 'Fractales de Williams', desc: 'Marca los giros cortos del precio (un máximo o mínimo con velas más bajas o más altas a cada lado)', art: 'patterns', code: `//@version=5
indicator("Fractales de Williams", "Fractales", overlay=true)
n = input.int(2, "Velas a cada lado", minval=1)
up = ta.pivothigh(high, n, n)
dn = ta.pivotlow(low, n, n)
plotshape(not na(up), "Fractal alto", shape.triangledown, location.abovebar, color.new(#ef5350, 0), offset=-n, size=size.tiny)
plotshape(not na(dn), "Fractal bajo", shape.triangleup, location.belowbar, color.new(#26a69a, 0), offset=-n, size=size.tiny)
`},
    {id: 'rvol', cat: 'volume', col: '#f5c568', name: 'Volumen relativo (RVOL)', desc: 'Cuántas veces el volumen de la vela supera su media: confirma rupturas y detecta entradas de ballenas', art: 'volume', code: `//@version=5
indicator("Volumen relativo (RVOL)", "RVOL", overlay=false)
len = input.int(20, "Media de volumen", minval=1)
k = input.float(2.0, "Volumen alto (× lo normal)", minval=1, step=0.5)
rv = volume / ta.sma(volume, len)
hline(1, "Normal", color.new(#787b86, 50))
hline(k, "Alto", color.new(#f5c568, 40))
plot(rv, "RVOL", rv >= k ? color.new(#f5c568, 0) : close >= open ? color.new(#26a69a, 40) : color.new(#ef5350, 40), style=plot.style_columns)
`},
    {id: 'chop', cat: 'volat', col: '#4dd0e1', name: 'Índice de Choppiness', desc: 'Dice si el mercado está en rango (arriba de 61.8) o en tendencia (abajo de 38.2) para elegir la estrategia', art: 'atr', code: `//@version=5
indicator("Índice de Choppiness", "CHOP", overlay=false)
len = input.int(14, "Período", minval=2)
ch = 100 * math.log10(math.sum(ta.atr(1), len) / (ta.highest(high, len) - ta.lowest(low, len))) / math.log10(len)
hline(61.8, "Rango", color.new(#ef5350, 40))
hline(38.2, "Tendencia", color.new(#26a69a, 40))
plot(ch, "CHOP", color.new(#4dd0e1, 0), 2)
`}
  ];
})(typeof self !== 'undefined' ? self : this);
