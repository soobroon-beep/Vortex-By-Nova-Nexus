/* Novedades de VORTEX (la más reciente primero). Solo los cambios grandes; los ajustes pequeños de diseño no se anotan aquí. */
window.CCT_CHANGELOG = [
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
