/* Novedades de VORTEX (la más reciente primero).
   SOLO hitos grandes: lanzamiento, IA, Nova Bot Lab, publicación con planes y un resumen de mejoras.
   Los arreglos y ajustes pequeños NO se anotan aquí: se suman al último bloque «Mejoras» sin crear versión nueva. */
window.CCT_CHANGELOG = [
  {v: '3.43', d: '19 nov 2026', t: 'Mejoras del gráfico', items: [
    'Mi seguimiento: varias listas (cripto, forex, acciones…) con el botón «Listas» arriba. Cada una guarda sus activos, secciones y colores.',
    'Ajustes de cada herramienta: niveles exactos. Escribe a mano la entrada, el stop loss y el take profit de Long/Short o el precio de cada punto de líneas, Fibonacci, rectángulos…',
    'Las plantillas de las herramientas guardan y aplican también el texto, no solo los colores.',
    'Bots que aprenden (Claudio, Felipe, Claudia 5 minutos): si pasan un día sin encontrar operación (6 h Claudia), bajan un poco su exigencia de confianza (nunca menos de 60 %) hasta volver a operar, y vigilan más monedas. Las reglas de riesgo no cambian y su historial se conserva.',
    'Arreglos: el Screener ya no se recarga al tocar el gráfico, la lista de seguimiento ya no parpadea, los iconos ya no se ven gigantes al restaurar la ventana y el tema Minimal ya no tiene botones blancos sin contraste.',
    'Configuración › Conectores: avisos a Telegram y a cualquier webhook (también con la app cerrada), calendario económico en Google Calendar (suscripción que se actualiza sola o .ics) e IA en tu computadora con Ollama o LM Studio en Tu IA.',
    'Nuevo bot en Nova Bot Lab: Claudia 5 minutos, gemela de Claudio (mismas reglas y la misma mejora automática) operando en velas de 5 minutos, con su propio historial.',
    'Ahora puedes dibujar sobre cualquier panel: oscilador, RSI, MACD y tus scripts.',
    'Configuración › Preferencias: cursor, cuenta atrás de la vela, aviso de conexión, confirmar antes de borrar, pantalla encendida, precio en la pestaña y hora y formato. Personalización queda solo para cómo se ve.',
    'Los botones de Estilo de la app tienen cada uno su propio estilo: Clásico, minimal y ESPACIAL (robótico).',
    'Avisos más simples: primero activas las notificaciones y se despliegan las opciones; eliges una sola vez qué te avisamos y al final dónde (VORTEX o Discord). En Discord eliges cuáles de esos avisos se envían.',
    'Nuevo en Avisos: volumen, vibración y horario sin sonido.',
    'En la PC con VORTEX minimizada los avisos llegan en su momento; ya no salen todos juntos al volver a abrirla.',
    'Las notificaciones muestran solo el icono de la app y el texto (sin el icono viejo de colores).',
    'Una sola etiqueta de precio en vivo; la cuenta atrás de la vela va dentro de ella.',
    'Aviso de conexión: naranja «Conectando», verde «En vivo» (y se quita) y rojo «Sin conexión».',
    'Todas las ventanas y menús aparecen con animación. Borrar una alerta ahora pide confirmación.',
    'Cursor nuevo «Órbita» y el cursor se puede cambiar también en el estilo Espacial. Espacial más fluido y 120 Hz en cualquier modo (también en Ligero).',
    'Personalización ordenada por secciones (Estilo y tema, Gráfico, Herramientas, Interfaz) con ajustes nuevos: cuenta atrás de la vela, aviso de conexión, confirmar antes de borrar, pantalla siempre encendida y precio en la pestaña.',
    'Nexus Pixel entiende lo que le pides: cambiar colores (velas, fondo, soportes y resistencias…), poner o quitar indicadores, cambiar temporalidad o moneda, cursor y tema; si falta el color te lo pregunta.',
    'Árbol de objetos: abajo a la izquierda, junto al imán, el candado y el ojo. Ve todos tus dibujos e indicadores, pásalos adelante o atrás, ocúltalos o bórralos.',
    'Al seleccionar un dibujo, la columna de precios marca sus niveles: inicio y fin de una línea, entrada, take profit y stop de un Long/Short, los extremos de un Fibonacci, etc.',
    'Tus colores guardados aparecen en todas las paletas de la app: dibujos, indicadores, velas y aspecto del gráfico.',
    'Los planes ya no salen al abrir: usa el gráfico libremente y solo verás los planes al tocar algo premium o desde tu perfil.',
    'Mantén presionado el clic derecho sobre el gráfico y mueve el ratón para acercar o alejar con suavidad (clic derecho corto = menú de siempre).',
    'El precio se mueve en vivo con cada operación del mercado, no cada 2 segundos.',
    'Lo premium se ve normal y solo al pasar el cursor aparece su brillo de galaxia; animaciones de Liquidaciones, Diseño y Nova Nexus más fluidas.',
    'Al conectar tu exchange puedes activar que su saldo llene la barra de la cuenta. Exchange y Tu IA solo salen con la sesión iniciada.',
    'Colores del mercado: 8 paletas alcista/bajista en Personalización para velas, volumen y variaciones en toda la app; se guardan en tu cuenta.',
    'Saldo de la cuenta como una píldora con tu % abajo del gráfico; al tocarla se abre la barra y sus ajustes.',
    'Tu exchange, Tu IA y tu historial de Nexus Lens son solo de tu cuenta: otra cuenta en el mismo navegador ya no los ve.',
    'Nexus Lens integrado con el mismo estilo de VORTEX, modo Ligero, zoom más suave y monedas más compactas en Mi seguimiento.'
  ]},
  {v: '3.39', d: '17 nov 2026', t: 'VORTEX publicada: planes y precios', items: [
    'Página oficial pública de VORTEX.',
    'Tres planes: Gratis (todo el gráfico, dibujos, indicadores gratuitos, noticias y alertas), Plus e Infinity.',
    'Infinity con BingX: cuenta con el código YCXE5W y al menos $100 para activarlo (ese dinero es tuyo, para operar). Mientras recargas, 7 días de Plus. Para renovar cada mes basta con haber operado en los últimos 7 días.',
    'Pago seguro dentro de la app y precios en la moneda de tu país. Infinity también se activa gratis con tu cuenta de BingX y el código YCXE5W.',
    'Tu plan y la opción de mejorarlo están en tu perfil.'
  ]},
  {v: '3.20', d: '11 nov 2026', t: 'Herramientas de trader profesional', items: [
    'Operar desde el gráfico, repetición de mercado, calculadora de riesgo, diario de trading, libro de órdenes, derivados en vivo y panel macro.',
    'Cada herramienta de dibujo con sus propios ajustes y plantillas, varias copias de un indicador y pestañas de gráficos independientes.',
    'Conecta tu exchange una sola vez y ve tus posiciones reales en el gráfico.',
    'Estilos Clásico, Minimal y Espacial.'
  ]},
  {v: '3.4', d: '8 nov 2026', t: 'Nova Bot Lab', items: [
    'Crea bots con lenguaje natural, con un constructor visual o con tus indicadores, y pruébalos con backtest y paper trading.',
    'Varios bots encendidos a la vez, cada uno con su color, icono, curva de capital y operaciones en el gráfico.',
    'Agentes autónomos que aprenden solos y bots que se reentrenan cada noche.'
  ]},
  {v: '2.4', d: '7 nov 2026', t: 'Inteligencia artificial', items: [
    'Nexus Pixel: tu asistente con IA dentro del gráfico. Conversa contigo, dibuja canales, soportes y rangos, y te ayuda en toda la app.',
    'Analizar gráfico con IA: lee tu gráfico y todos tus indicadores, y puedes seguir preguntándole.',
    'Briefing del día con noticias, calendario económico y tus indicadores.',
    'Laboratorio de indicadores: describe un indicador con tus palabras y la IA lo programa, lo valida y lo prueba.'
  ]},
  {v: '1.0', d: '16 oct 2026', t: 'Lanzamiento de VORTEX', items: [
    'Gráfico en vivo, indicadores, herramientas de dibujo y tu indicador Nova Nexus.',
    'Mi seguimiento, noticias, Screener, alertas y Nexus Lens.',
    'Tus propios scripts de Pine Script en «Mis indicadores».',
    'Inicio de sesión con Google: todo se guarda en tu cuenta.'
  ]}
];
