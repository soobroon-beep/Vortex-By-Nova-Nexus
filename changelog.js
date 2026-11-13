/* Novedades de VORTEX (la más reciente primero). Solo los cambios grandes; los ajustes pequeños de diseño no se anotan aquí. */
window.CCT_CHANGELOG = [
  {v: '3.34', d: '13 nov 2026', t: 'Señales de bots, consejos de qué hacer y tu IA', items: [
    'Nova Bot Lab: se quitó «Ver en el gráfico»; «Convertir bot a señales» ocupa su lugar y marca las cajitas COMPRA / VENTA con entrada, SL y TP, y al cerrar dice TP, SL o Cierre con el % que ganó o perdió.',
    'Consejos y mejoras: arriba te dice qué hacer ahora con el bot: dejarlo correr, probarlo más, hacer solo cambios mínimos o cambiarlo (y te avisa si le has hecho demasiados cambios seguidos).',
    'Se arreglaron los interruptores de encendido de los bots en la lista (se veían verdes sólidos).',
    'Noticias, Alertas, Screener y Nova Bot Lab muestran su icono grande junto al nombre, sin marco.',
    'Tu IA: textos más claros para conectar tu propia IA.'
  ]},
  {v: '3.33', d: '13 nov 2026', t: 'Nova Bot Lab renovado y tu propia IA', items: [
    'Nova Bot Lab: cada bot se ve como una línea de producción: el motor arranca, opera, muestra resultados y se mejora, unidos por hilos animados. Toca cada estación para ver su detalle.',
    'Nova Bot Lab: nuevo «Cómo aprende»: el ciclo del bot (opera, recuerda, analiza, prueba variantes y se queda con la mejor) con una luz que lo recorre, cuánto mejoró desde su v1 y lo último que aprendió.',
    'Nova Bot Lab: bajo la línea de producción, un hilo regresa de «Mejora» al bot con lo último que aprendió: lo que aprende vuelve a él.',
    'Reglas plegadas en un botón «Reglas del bot» (tócalo para verlas o editarlas) y una fila con los consejos ya aplicados.',
    'Un consejo ignorado vuelve a salir si el bot sigue fallando en eso (la IA lo vuelve a proponer con datos nuevos o tras 15 operaciones en vivo más).',
    'En vivo: arriba y completas solo las sesiones con una operación abierta; las que esperan señal salen como tarjeta pequeña que se despliega al tocarla.',
    'La pestaña «Mejorar» ahora se llama «IA» (dentro: Mejorar con IA). En Operaciones, «Abiertas ahora en cada moneda» muestra solo las monedas con una operación abierta.',
    'Avisos a Discord por bot: enciéndelos y elige si llegan a tu canal de VORTEX o a un canal solo para ese bot (pegas el webhook de ese canal y se manda una prueba).',
    'Si al bot le falta algo (una regla de entrada, un stop válido, un indicador que ya no está) o se traba en vivo, la máquina se ve apagada y te dice qué falla y cómo componerlo, con un botón directo.',
    'Operaciones ahora es el historial: lo ya cerrado en vivo o en el backtest, con el gráfico de dónde compró y vendió y una barra por operación (ganó/perdió) con lo acumulado.',
    'En vivo: cada operación abierta trae su gráfico con la entrada, el stop (rojo), el objetivo (verde) y dónde va el precio ahora.',
    'El botón «Editar» ahora es «Mejorar», con tres partes: Reglas (plegadas), Consejos y mejoras, y Versiones.',
    'Consejos y cambios a las reglas se PRUEBAN primero con velas reales contra la versión actual en los mismos datos; ves si de verdad mejora en lo que no vio (sí mejora, casi igual o empeora) y tú decides si aplicarlo. Puedes mandar varios a probar: van en fila sin trabarse.',
    'Versiones: cuál ha sido la mejor (con botón para restaurarla), qué cambió respecto a la anterior y qué hace cada una.',
    'Operaciones: «Cerradas» en lugar de «Cerradas en vivo» y cada moneda muestra cuántas operaciones hizo (las que no tienen, solo el nombre).',
    '«Convertir bot a señales»: el indicador que se crea marca cajitas COMPRA / VENTA como IA Signals y, mientras la operación sigue abierta, su entrada, SL y TP; al cerrar marca TP, SL o Cierre.',
    'Los bots con indicadores Nova o tuyos también se convierten a señales: sus cajitas COMPRA / VENTA con entrada, SL y TP salen en el gráfico que tengas abierto (el mismo botón las quita).',
    'Consejos: si la prueba muestra que sí mejora, queda listo para aplicar; si no mejora, se queda la versión actual sola (lo ves en «Probados que no mejoraron»). Para contar como mejora tiene que ganar en las dos partes de los datos que no vio.',
    'Cuando la máquina está detenida porque se trabó en vivo, el botón «Arreglarlo» lo corrige solo: una señal de tu indicador que no salió en esas velas ya no detiene al bot y una línea que cambió de nombre se encuentra sola.',
    '«Icono y color» se movió al menú ⋯ del bot.',
    'Bot con problema: en la lista, la cabecera y el botón dice «Problema» con el punto naranja en lugar de «En vivo».',
    'Configuración › Cuenta › Tu IA: elige tu IA (OpenAI, Claude, Gemini, Grok, DeepSeek, Mistral, Groq, OpenRouter…), pega tu clave y todo lo que usa IA (Nexus Pixel, briefing, consejos de bots, Analizar gráfico, Laboratorio) la usa; sin clave sigue la IA gratis.',
    'Configuración: los iconos van solos, a color, sin el recuadro tipo app.',
    'Operaciones: en lugar de las velas, una línea de precio simple con cada compra y venta marcada (verde si ganó, rojo si perdió) y tarjetas de las últimas operaciones. Las velas siguen en «Ver con velas».',
    'Consejos: nuevo botón «Ignorar consejo» junto a «Aplicar este consejo»; el consejo se quita y deja lugar a otros.',
    'En vivo: más visual y con menos texto: resultado grande, la posición abierta en una barra (stop · entrada · ahora · objetivo), números clave como fichas y lo que prometió vs. lo que está haciendo en barras.'
  ]},
  {v: '3.32', d: '13 nov 2026', t: 'Fibonacci lateral', items: [
    'Fibonacci automático: nuevo estilo «Lateral derecho» en sus ajustes: líneas punteadas y delgadas que salen del lado derecho del gráfico sin tocar las velas, solo con el nivel (sin precio) y los niveles clave más resaltados.',
    'Colores por nivel o monocromáticos, y el largo de las líneas se elige en % del gráfico (como el perfil de volumen).'
  ]},
  {v: '3.31', d: '12 nov 2026', t: '15 indicadores gratis nuevos', items: [
    'Leyenda de indicadores abierta: cada nombre con sus botones va en una píldora de cristal oscuro para que no se pierda con las velas.',
    'Fibonacci (herramienta y automático): todos los niveles con su color tenue y el mismo fondo; solo las líneas de los niveles clave (0.5, 0.618, 0.65, 0.786 y 1.618) más vivas. El automático usa líneas punteadas y marca con una línea punteada el tramo que está midiendo.',
    'Patrones: cada tipo (armónico, 1-2-3, ABC, doble techo/suelo, HCH, triángulo/cuña, Elliott) se dibuja con su propio tono de verde o de rojo para distinguirlos fácil.',
    'Tendencia: Cinta de EMAs 9/21/50/200, UT Bot (compra/venta), Chandelier Exit y Canal de regresión lineal.',
    'Osciladores: Squeeze Momentum, WaveTrend, RSI con divergencias, Vortex Indicator (VI) y Aroon.',
    'Estructura: Máximo y mínimo del día y semana anterior, Soportes y resistencias automáticos, ZigZag y Fractales de Williams.',
    'Volumen y volatilidad: Volumen relativo (RVOL) e Índice de Choppiness. Todos en Indicadores › Gratuitos, con sus ajustes en el engrane.'
  ]},
  {v: '3.30', d: '12 nov 2026', t: 'Tu paleta de colores en toda la app', items: [
    'Cualquier cuadro de color (indicadores, Nova Nexus, scripts Pine, Aspecto del gráfico, alertas…) abre la misma paleta que las herramientas de dibujo.',
    'Mis colores: guarda hasta 20 colores con «+ Guardar»; quedan en tu cuenta y salen en todas las paletas, también en la de los dibujos. Con «Editar» quitas los que ya no uses.',
    'Los menús y cajas de ajustes de las herramientas, la calculadora de riesgo y los menús de clic derecho aparecen y se desvanecen con animación.',
    'La ventana de bienvenida muestra el logo oficial en blanco.'
  ]},
  {v: '3.29', d: '12 nov 2026', t: 'Ajustes en vivo', items: [
    'Al configurar un indicador, Nova Nexus, tus scripts Pine o el Aspecto del gráfico, los cambios se ven al momento en el gráfico. La ventana sale centrada y la puedes mover arrastrando su título (doble clic: regresa al centro).',
    'Nueva apertura: cielo negro con estrellas que se acercan y el logo oficial en blanco.',
    'Aceptar guarda; Cancelar (o cerrar la ventana) regresa todo como estaba.'
  ]},
  {v: '3.28', d: '12 nov 2026', t: 'Apertura espacial y Discord bajo tu control', items: [
    'Nueva animación al abrir o recargar VORTEX: viaje entre estrellas, tu logo con su órbita y un salto a velocidad luz al entrar.',
    'Si apagas «Enviar avisos a Discord», ya no sale nada a Discord (alertas de precio, con indicador, movimientos, bots y radar), tampoco desde el servidor con la app cerrada. Al encenderlo vuelven a llegar.',
    'Cuando tu operación real se cierra (TP, SL o a mano), sus líneas se quitan del gráfico en segundos: VORTEX revisa tu exchange más seguido mientras tienes posiciones abiertas.',
    'En la PC, el ícono de la app instalada y de la pestaña es solo el logo, sin fondo.'
  ]},
  {v: '3.27', d: '11 nov 2026', t: 'Tus bots aprenden solos', items: [
    'Todos los bots (también los nuevos) tienen reentrenamiento diario y mejora automática: si una versión nueva gana en datos que no vio, pasa a ser la principal, la simulación sigue con ella y te avisa. La anterior queda en Versiones para regresar.',
    'El servidor ya encuentra tus scripts grandes (como Señales iA 2.7) y no repite avisos de los bots.',
    'Nuevo motor del servidor: las alertas con indicador se revisan cada minuto y el paper trading de tus bots y Claudio corren cada hora de verdad.'
  ]},
  {v: '3.26', d: '11 nov 2026', t: 'Abre en el gráfico', items: [
    'Con tu sesión iniciada, VORTEX abre directo en el gráfico (en el celular). Sin sesión sigue saliendo la ventana para iniciar sesión.',
    'En la barra de abajo del celular, «Seguimiento» ya cabe dentro de la burbuja.'
  ]},
  {v: '3.25', d: '11 nov 2026', t: 'Controles modernos en toda la app', items: [
    'Listas desplegables de cristal con animación (ya no salen en blanco), casillas, deslizadores, colores y campos con el mismo estilo en todas las ventanas.',
    'El botón principal de cada ventana (Aceptar, Guardar, Crear) se ve en azul; antes quedaba oscuro.',
    'Tus scripts Pine pueden pedir datos de otros exchanges con request.security, como en TradingView: «BINGX:BTCUSDT.P», «BYBIT:SOLUSDT», «OKX:ETHUSDT.P», «COINBASE:BTCUSD»… Sin prefijo usan el exchange del gráfico.',
    'Los favoritos de la píldora del celular se guardan en tu cuenta y aparecen en tus otros celulares.'
  ]},
  {v: '3.24', d: '11 nov 2026', t: 'Alertas con indicador con la app cerrada', items: [
    'Tus alertas con indicador (indicadores comunes, Nova Nexus y tus scripts Pine) ahora también te avisan con VORTEX y el celular cerrados: el servidor las revisa al cerrar cada vela.',
    'La alerta salta igual que en la app (misma lógica) y, si la configuraste así, también llega a Discord. Cuando la app vuelve a abrir, la alerta ya aparece como disparada.',
    'Las alertas con indicador y de precio funcionan con monedas de cualquier exchange (BingX, Bybit, OKX, Coinbase, KuCoin…), con las velas de ese exchange.'
  ]},
  {v: '3.23', d: '11 nov 2026', t: 'Favoritos en la píldora del gráfico y dock de cristal', items: [
    'En el celular, deja presionado un botón del menú del gráfico (Indicadores, Liquidaciones, Operar…) para fijarlo junto a la estrella; la píldora crece con tus favoritos (hasta 5).',
    'La barra de abajo del celular (Seguimiento, Gráfico, Noticias…) es de cristal oscuro y deja ver el contenido al pasar por detrás.',
    'Tus bots de Nova Bot Lab ahora también te avisan en el celular (no solo en Discord) cuando compran, venden o cierran, aunque VORTEX esté cerrada. Se apaga en Avisos › Mis bots.'
  ]},
  {v: '3.22', d: '11 nov 2026', t: 'Nombres de pestañas, menús de ver y borrar', items: [
    'Clic derecho (o doble clic) en una pestaña para cambiarle el nombre o cerrarla.',
    'En el celular, el menú del gráfico tiene Pestañas (cambiar, renombrar, cerrar o crear), Ver (ocultar o mostrar dibujos e indicadores) y Borrar.',
    'La basura, también en escritorio, deja elegir si borras solo los dibujos o solo los indicadores; el ojo oculta dibujos, indicadores o todo.',
    'La moneda abierta en el gráfico se resalta en Mi seguimiento con un tono morado sutil.',
    'El botón «+» junto a la moneda solo aparece cuando la moneda todavía no está en tu lista.'
  ]},
  {v: '3.21', d: '11 nov 2026', t: 'Seguimiento de tus trades y botón «+» en el gráfico', items: [
    'Junto a la tarjeta de la moneda en el gráfico hay un botón «+» para agregarla a Mi seguimiento (más pequeño en el celular).',
    'Con tu exchange conectado y un trade abierto, VORTEX te va avisando cómo va: cada escalón de ganancia o pérdida, cerca de tu TP, SL o liquidación, si regresa a tu entrada y si cruza tus líneas horizontales.',
    'Los avisos de tus trades también llegan con la app cerrada si activaste las notificaciones; puedes apagarlos o elegir cada cuánto en Avisos.',
    'En Mi seguimiento, las monedas en las que estás en un trade tienen un anillo animado y una etiqueta L o S con tu ganancia o pérdida.',
    'La moneda que tienes abierta en el gráfico se resalta ligeramente en Mi seguimiento, con un destello al cambiar de moneda.',
    'Las monedas que agregas quedan hasta abajo de tu lista.',
    'El indicador se llama solo «Nova Nexus©» y las cajas de order blocks ya no tienen contorno azul.'
  ]},
  {v: '3.20', d: '11 nov 2026', t: 'Planes activos, varias copias de un indicador y pestañas independientes', items: [
    'Al abrir VORTEX sin sesión aparece una ventana para iniciar sesión con Google; si la cierras sigues con el plan Gratis.',
    'Plus se verifica con tu suscripción al canal de YouTube e Infinity con tu UID de BingX registrado con el código. Nada se cobra.',
    'Todo lo premium bloqueado lleva fondo de galaxia y al tocarlo se abren los planes; cuando lo desbloqueas se ve normal.',
    'Puedes poner varias EMA, SMA, WMA o Bandas de Bollinger a la vez (botón «＋»), cada una con su propia configuración.',
    'Cada pestaña de gráfico guarda sus propios indicadores y ajustes: cambiar uno en una pestaña ya no cambia las demás.',
    'Nuevo cursor Estrella con estela, e icono de la app 35 «Neón sobre negro».'
  ]},
  {v: '3.19', d: '10 nov 2026', t: 'Nexus Pixel te recuerda tus reglas y la barra del celular más liquid glass', items: [
    'Nexus Pixel mira tu gráfico cada cierto tiempo, lo compara con las reglas que le configuraste y se asoma con un mensajito: te recuerda la regla que aplica y te dice su lectura. Eliges cada cuánto (o lo apagas) en su tarjeta de la IA: «Avisos de tus reglas».',
    'Celular: la barra y sus menús son más transparentes, los botones se despliegan como píldoras (Indicadores, Liquidaciones, Dibujar, Plantillas…), la estrella ya no es amarilla y puedes cambiar de temporalidad deslizando el dedo arriba o abajo sobre ella.',
    'Liquidaciones tiene un botón con fondo de galaxia para quien tiene el plan que lo incluye (oscuro si no), y el color de cada moneda en Mi seguimiento es un punto a la izquierda, todos en la misma columna.',
    'Todos los menús y ventanas de la app (ajustes, clic derecho, opciones de cada moneda, herramientas favoritas, barra de dibujos…) usan el mismo liquid glass oscuro y translúcido.'
  ]},
  {v: '3.18', d: '10 nov 2026', t: 'Cada herramienta de dibujo con sus propios ajustes', items: [
    'En «Ajustes» cada herramienta tiene lo suyo: en Fibonacci eliges qué niveles salen (y añades los tuyos), su color, fondo, etiquetas y extensiones; Long/Short tiene stop automático, opacidad y porcentajes; el texto tiene negrita, cursiva, fondo y borde; las formas, borde y fondo; las líneas, extensiones y datos…',
    'Las plantillas de cada herramienta guardan también esos ajustes, y la herramienta recuerda cómo la usaste la última vez.',
    'Mientras dibujas, el trazo ya sale con el color, grosor y ajustes de la última vez (antes salía con el color predeterminado hasta soltarlo).',
    'USDT.D y BTC.D: la muestra de cada 15 min ahora la toma el servidor (GitHub tardaba horas entre una y otra) y el historial se reconstruye solo, por partes.'
  ]},
  {v: '3.17', d: '10 nov 2026', t: 'Vela en vivo fluida y USDT.D con la fórmula CRYPTOCAP', items: [
    'La vela se mueve con cada dato en vivo: los indicadores ya no frenan el gráfico y, si la conexión falla, la vela se sigue actualizando cada 2 s mientras se reconecta.',
    'USDT.D y BTC.D se calculan como CRYPTOCAP (moneda / suma de las 125 criptomonedas más grandes) con capitalizaciones reales: por hora 90 días, por día 1 año y en vivo cada minuto.',
    'Clic derecho: «Restablecer gráfico» va primero. Los logos de los exchanges aparecen al instante.'
  ]},
  {v: '3.16', d: '10 nov 2026', t: 'Nombres Nova Nexus©, logos de exchanges y operación compacta en el celular', items: [
    'Tus indicadores se llaman «Nova Nexus© - Personal», «- IA Signals», «- Oscilador», «- Señales», «- Screener»… y la leyenda ya no muestra la «ƒ».',
    'En el celular, tu operación ocupa solo una pastilla pequeña a la izquierda; tócala para ver +TP, +SL y ✕. Conectar exchange muestra el logo de cada exchange.',
    'Clic derecho: Copiar precio y Añadir alerta van primero. Si BingX no deja operar, te explica que hay que crear una clave nueva con el permiso de futuros.'
  ]},
  {v: '3.15', d: '10 nov 2026', t: 'Gráfico siempre en vivo y botón VORTEX para todos tus dispositivos', items: [
    'El gráfico ya no se congela al dejarlo abierto: si la conexión en vivo se cuelga (la compu durmió o cambió la red), se reconecta solo en segundos.',
    'El botón VORTEX ahora guarda y actualiza en TODOS tus dispositivos abiertos: cada uno sube lo suyo, se mezcla sin pisarse y se refresca.',
    'Avisos con la app cerrada más confiables: el servidor gasta menos, muestra su estado y hay una «Prueba con la app cerrada». Las líneas de tu operación son más minimalistas.'
  ]},
  {v: '3.14', d: '10 nov 2026', t: 'Radar en el servidor, bots multi-temporalidad y TP/SL reales en el gráfico', items: [
    'El Radar de Nexus Pixel trabaja en el servidor cada hora, aunque la app y el celular estén cerrados (con «Activar notificaciones»).',
    'Bots: tu edición se aplica siempre (ya no se queda en 4h); elige varias temporalidades y monedas y mira cómo va cada una por separado.',
    'Tu posición real del exchange se dibuja en el gráfico con TP y SL que puedes arrastrar; Avisos ahora vive en Configuración; señales más separadas de las velas y cada dibujo nuevo usa tu última configuración.'
  ]},
  {v: '3.13', d: '8 nov 2026', t: 'Radar de Nexus Pixel y alertas en cualquier exchange', items: [
    'Las alertas de precio ya funcionan en monedas de Binance Futuros, Bybit, OKX, BingX y demás (antes se borraban) y también avisan a Discord con la app cerrada.',
    'Nuevo «Grandes oportunidades»: Nexus Pixel revisa el Screener cada hora, aplica filtros, lo confirma con IA, te avisa y aprende de los resultados.',
    'Operar en real explica exactamente qué permiso falta en tu exchange; la caja Long/Short puede ocultar el texto de tamaño y riesgo; Nova LITE estrena imagen.'
  ]},
  {v: '3.12', d: '8 nov 2026', t: 'Conecta tu exchange una sola vez', items: [
    'Nuevo «Conectar exchange» (menú de tu cuenta y Configuración › Cuenta): elige entre más de 100 exchanges (BingX, Binance, Bybit, OKX, Bitget…), pega tu API una vez y queda guardada en tu cuenta.',
    'Con el exchange conectado, la barra de saldo usa tu saldo real, Nexus Lens se conecta solo (BingX) y, si permites operar en vivo, Operar tiene modo Real con confirmación en cada orden.',
    'El oscilador guarda su altura y su posición, y al arrastrar dentro de él solo se mueve el oscilador (las velas se quedan quietas). «Plantilla» ahora se llama «Plantillas».'
  ]},
  {v: '3.11', d: '8 nov 2026', t: 'Pestañas de cristal y bots con operación abierta', items: [
    'Las pestañas de gráficos son de cristal oscuro como la barra de temporalidades y se guardan en tu cuenta tal como las dejas.',
    'Nova Bot Lab marca con un indicador Long/Short los bots que tienen una operación abierta.',
    'Hora, fecha y formato ahora están en Personalización › Apariencia; Noticias ya no parpadea al abrirse y en Brave las notificaciones funcionan con la app abierta.'
  ]},
  {v: '3.10', d: '8 nov 2026', t: 'Notificaciones con un solo botón y menú de tu cuenta', items: [
    'Alertas › Avisos: «Activar notificaciones» enciende todo de una vez (sonido, vibración y avisos con la app cerrada). En «Qué te avisamos» están juntos precio, indicador, movimientos bruscos (con su sensibilidad) y señales del Screener.',
    'Alertas tiene botón ‹ para volver, pestañas más cortas (Mis alertas · Avisos · Historial) y en Discord primero el servidor Nova Nexus y luego el envío de avisos.',
    'Tu foto abre el menú de la cuenta con «Cerrar sesión»; Configuración ya no muestra la tarjeta de la cuenta. Nueva «Personalización de la aplicación» con tema, aspecto del gráfico, barra de favoritos e íconos.'
  ]},
  {v: '3.9', d: '8 nov 2026', t: 'Torneo de bots, bots «Seguro» y avisos a Discord', items: [
    'Torneo de bots: todos los encendidos (Claudio incluido, ahora es un bot más) compiten en vivo con podio, clasificación y curvas.',
    'Nuevos bots «Seguro 1h» y «Seguro 4h»: solo compras en tendencia alcista confirmada en BTC, ETH, SOL, BNB y XRP, riesgo bajo y objetivo cercano. Los bots ya pueden operar una cesta de varias monedas.',
    'Avisos a tu Discord de cada compra, venta y cierre (botón por bot y opción en Configuración › Discord). «Señales al gráfico» convierte un bot en indicador de tu gráfico. Palomita animada al aplicar una versión nueva y personaje editable al editar.'
  ]},
  {v: '3.8', d: '8 nov 2026', t: 'Claudio estable y bots guardados en tu cuenta', items: [
    'Claudio ya no se apaga solo: su encendido y su progreso se guardan en tu cuenta junto con tus bots, y avanza en tu navegador con VORTEX abierto (y en el servidor cuando no).',
    'Al encender un bot empieza en cero. En Resumen y Operaciones se separa «En vivo» (desde que lo encendiste) de «Historia» (backtest).',
    'Nueva sección «Cambios aplicados» en cada bot: qué consejo o edición se aplicó en cada versión y cómo le fue. Personajes sin fondo.'
  ]},
  {v: '3.7', d: '8 nov 2026', t: 'Varios bots encendidos a la vez', items: [
    'Cada bot (y Claudio) tiene su interruptor en la lista: enciende varios a la vez para comparar estrategias en vivo.',
    'Personajes espaciales a color para tus bots: robot, astronauta, alien, cohete, planeta, estrella, OVNI, luna, cometa, pulpo, satélite y vórtice.',
    'El gráfico de compras y ventas muestra toda la historia de una vez. Arreglado el botón de volver al editar un bot.'
  ]},
  {v: '3.6', d: '8 nov 2026', t: 'Consejos de la IA para cada bot', items: [
    'En Editar, debajo de las reglas: cómo va el bot, qué vio la IA y consejos para ESE bot (tendencia, aciertos, horario, riesgo, temporalidad y en qué moneda funciona mejor). Un clic en «Aplicar» lo prueba y lo deja como principal si no empeora.',
    'En Operaciones, debajo del diario: gráfico de velas con cada compra, venta y salida del bot.',
    'Elige color e icono espacial para cada bot. «Simular en vivo» se enciende con un clic y sigue encendido hasta que lo pauses o lo termines.'
  ]},
  {v: '3.5', d: '8 nov 2026', t: 'Nova Bot Lab más sencillo', items: [
    'Al abrir Nova Bot Lab solo ves Crear, Importar, Panel de riesgo, Comparar y la lista de tus bots con su mini curva y rendimiento.',
    'Al tocar un bot aparece todo lo visual: rendimiento grande, aciertos, caída máxima, curva de capital, ranking y actividad.',
    'Botones directos en cada bot: Probar, Editar, Simular y Ver en el gráfico; las opciones avanzadas quedan dentro de «Mejorar».'
  ]},
  {v: '3.4', d: '8 nov 2026', t: 'Claudio, agente de trading autónomo', items: [
    'Nuevo en Nova Bot Lab (PC): Claudio, un agente que corre 24/7 en el servidor, evalúa cada vela de 1 h de 8 criptomonedas con Jev en una sola llamada y opera con capital virtual.',
    'Riesgo fijo en el código: drawdown máx. 15 %, pérdida diaria máx. 3 %, 20 % por posición, ¼ de Kelly e interruptor de emergencia.',
    'Cada noche mide su calibración (Brier), revisa oportunidades perdidas y se recalibra solo si mejora fuera de muestra.'
  ]},
  {v: '3.3', d: '8 nov 2026', t: 'Barra flotante del gráfico', items: [
    'En el celular la barra del gráfico es flotante: muestra solo tu temporalidad actual y la estrella de favoritos; la flecha despliega todo lo demás.',
    'Mantén la agarradera y arrástrala donde quieras: se queda ahí para siempre en tu celular.'
  ]},
  {v: '3.2', d: '8 nov 2026', t: 'Gráfico más amplio en el celular', items: [
    'La barra del gráfico ahora es una píldora de cristal oscuro debajo del gráfico (no tapa el oscilador): temporalidad, indicadores, plantilla, operar, tus herramientas favoritas ★ y deshacer.',
    'Dibujar, Liquidaciones, Repetición, Libro, Diario, Diseño y Velas están en «⋯».',
    'En el celular ya no aparece la franja de derivados junto al precio.'
  ]},
  {v: '3.1', d: '8 nov 2026', t: 'Avisos del Screener puntuales', items: [
    'Las señales del Screener (1h y 4h) ahora las manda el servidor VORTEX al empezar cada hora, sin depender de GitHub: llegan a tiempo y sin saltarse horas.',
    'Nuevo: recibe esas señales también como notificación en tu celular (Alertas › Movimientos y señales).',
    'Al tocar una notificación se abre VORTEX en su dirección correcta.'
  ]},
  {v: '3.0', d: '8 nov 2026', t: 'Diario de trading y libro de órdenes', items: [
    'Diario de trading: cada operación de la cuenta demo se anota sola con captura del gráfico al abrir y al cerrar. También puedes agregar tus operaciones reales.',
    'Estadísticas del diario: % ganadoras, factor de beneficio, esperanza, R promedio, curva de capital, calendario de ganancias y resultados por activo, día y motivo de cierre.',
    'Etiqueta cada operación con su setup, cómo te sentiste y tus errores, escribe notas y exporta todo a CSV.',
    'Libro de órdenes: compras y ventas agrupadas, spread, desequilibrio, curva de profundidad y muros. Toca un nivel para preparar una orden ahí.',
    'Opción para ver la profundidad del libro como barras sobre el gráfico.'
  ]},
  {v: '2.9', d: '8 nov 2026', t: 'Derivados en vivo', items: [
    'Junto al precio: funding con cuenta regresiva al próximo cobro, interés abierto con su cambio en 24 h y ratio long/short.',
    'Toca esos datos para ver el detalle: funding anualizado, precio mark e índice, prima de futuros y una lectura de lo que está pasando.',
    'Nuevos paneles en Indicadores › Derivados: Interés abierto, Funding, Ratio Long/Short (cuentas y top traders) y Delta agresivo.'
  ]},
  {v: '2.8', d: '8 nov 2026', t: 'Operar desde el gráfico', items: [
    'Nuevo botón Operar: cuenta demo con órdenes a mercado, límite y stop, apalancamiento, TP y SL.',
    'Tus posiciones y órdenes se ven en el gráfico: arrastra el TP, el SL o la orden para moverlos, y usa ✕ para cerrar o cancelar.',
    'Clic derecho en el gráfico: «Comprar en…» o «Vender en…» deja la orden lista en ese precio.',
    'Planes con fondos animados y la nueva lista de lo que incluye Gratis, Plus e Infinity.'
  ]},
  {v: '2.7', d: '8 nov 2026', t: 'Panel macro y planes', items: [
    'Panel macro en Noticias: dólar (DXY), S&P 500, Nasdaq, bono a 10 años, VIX, oro, petróleo, miedo y codicia y dominancia, con su lectura para la cripto.',
    'Nuevos planes: Gratis, Plus (suscriptores de YouTube) e Infinity (cuenta BingX con el código YCXE5W). Se ven en Configuración › Tu plan.'
  ]},
  {v: '2.6', d: '8 nov 2026', t: 'Repetición de mercado y calculadora de riesgo', items: [
    'Repetición de mercado: elige un punto del pasado y practica viendo avanzar las velas una a una, con pausa y velocidades.',
    'Calculadora de riesgo: tamaño de posición según tu capital y % de riesgo, margen, apalancamiento y precio de liquidación; se ve en tus dibujos Long/Short.',
    'Nova LITE · Smart Money Concepts gratis para todos en Nova Nexus.'
  ]},
  {v: '2.5', d: '7 nov 2026', t: 'Indicadores y convertidor de Pine', items: [
    'Nuevo explorador de indicadores por categorías, con buscador.',
    'Convertidor de Pine profesional: prueba tu script en tus velas y, si algo falla, la IA lo corrige sola (hasta 3 intentos).',
    'Tus indicadores quedan guardados en tu cuenta con su imagen; ahora caben hasta 3 MB de scripts.',
    'Nuevos indicadores gratuitos: SMA, Media de Hull, Cruce dorado, Pivotes diarios, Fibonacci automático y Volumen con media.'
  ]},
  {v: '2.4', d: '7 nov 2026', t: 'Inteligencia artificial', items: [
    'Nexus Pixel: tu asistente con IA dentro del gráfico. Conversa contigo, dibuja canales, soportes y rangos, y te ayuda en toda la app.',
    'Analizar gráfico con IA: lee tu gráfico y todos tus indicadores, y puedes seguir preguntándole.',
    'Laboratorio de indicadores: describe un indicador con tus palabras y la IA lo programa, lo valida y lo prueba.',
    'Nova Bot Lab (PC): crea bots con lenguaje natural o con tus indicadores, con backtest y paper trading.'
  ]},
  {v: '2.1', d: '4 nov 2026', t: 'Avisos en tu celular y varios gráficos', items: [
    'Avisos aunque la app esté cerrada, para alertas de precio y movimientos bruscos.',
    'Pestañas de gráficos y hasta 5 gráficos lado a lado.',
    'Calendario económico en vivo con cuenta regresiva al próximo evento importante.',
    'Mapa de calor de liquidaciones (Premium).'
  ]},
  {v: '1.9', d: '2 nov 2026', t: 'Discord Nova Nexus', items: [
    'Únete al servidor Nova Nexus desde la app.',
    'Señales del Screener cada hora y cada 4 horas en el canal #vortex, sin tener la app abierta.'
  ]},
  {v: '1.8', d: '30 oct 2026', t: 'Nexus Lens', items: [
    'Tu cuenta, operaciones abiertas e historial sin salir del gráfico.'
  ]},
  {v: '1.0', d: '16 oct 2026', t: 'Lanzamiento de VORTEX', items: [
    'Gráfico en vivo, indicadores, herramientas de dibujo y tu indicador Nova Nexus.',
    'Tus propios scripts de Pine Script en «Mis indicadores».',
    'Inicio de sesión con Google: todo se guarda en tu cuenta.'
  ]}
];
