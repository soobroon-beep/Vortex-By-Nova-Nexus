/* Indicadores gratuitos extra (para todos), escritos en Pine y ejecutados por el motor de VORTEX.
   Aparecen en el panel de Indicadores dentro de «Gratuitos», con su categoría. */
(function (root) {
  'use strict';
  root.CCTFree = [
    {id: 'sma', cat: 'trend', col: '#4dd0e1', name: 'SMA', desc: 'Media móvil simple con período y fuente editables', art: 'ema', code: `//@version=5
indicator("SMA", overlay=true)
len = input.int(50, "Período", minval=1)
src = input.source(close, "Fuente")
col = input.color(#4dd0e1, "Color")
plot(ta.sma(src, len), "SMA", col, 2)
`},
    {id: 'hma', cat: 'trend', col: '#ffb74d', name: 'Media de Hull (HMA)', desc: 'Media muy rápida y suave que reduce el retraso; cambia de color según su pendiente', art: 'ema', code: `//@version=5
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
    {id: 'autofib', cat: 'struct', col: '#ffd54f', name: 'Fibonacci automático', desc: 'Retroceso de Fibonacci entre el máximo y el mínimo recientes, con sus niveles clave', art: 'patterns', code: `//@version=5
indicator("Fibonacci automático", "Auto Fib", overlay=true, max_lines_count=20, max_labels_count=20)
lb = input.int(150, "Velas a revisar", minval=20)
hi = ta.highest(high, lb)
lo = ta.lowest(low, lb)
hiBar = ta.highestbars(high, lb)
loBar = ta.lowestbars(low, lb)
sube = loBar < hiBar
var lvls = array.from(0.0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0)
var cols = array.from(#787b86, #ef5350, #ff9800, #4caf50, #089981, #00bcd4, #787b86)
if barstate.islast
    for i = 0 to array.size(lvls) - 1
        f = array.get(lvls, i)
        y = sube ? hi - (hi - lo) * f : lo + (hi - lo) * f
        line.new(bar_index - lb, y, bar_index + 10, y, color=array.get(cols, i), width=1, style=line.style_dashed)
        label.new(bar_index + 10, y, str.tostring(f) + " (" + str.tostring(y, format.mintick) + ")", style=label.style_label_left, color=color.new(color.black, 100), textcolor=array.get(cols, i), size=size.small)
`},
    {id: 'volma', cat: 'volume', col: '#8294a8', name: 'Volumen con media', desc: 'Volumen por vela en panel propio con su media de 20 y marca cuando hay volumen anormal', art: 'volume', code: `//@version=5
indicator("Volumen con media", "Vol + MA", overlay=false, format=format.volume)
len = input.int(20, "Media", minval=1)
k = input.float(2.0, "Volumen anormal (× media)", minval=1)
m = ta.sma(volume, len)
plot(volume, "Volumen", close >= open ? color.new(#26a69a, 40) : color.new(#ef5350, 40), style=plot.style_columns)
plot(m, "Media", color.new(#f5c568, 0), 2)
plotshape(volume > m * k, "Anormal", shape.circle, location.top, color.new(#f5c568, 0), size=size.tiny)
`}
  ];
})(typeof self !== 'undefined' ? self : this);
