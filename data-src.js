/* De dónde se leen los datos que actualizan los flujos de GitHub (noticias, calendario, dominancia).
   En la página oficial (Cloudflare Pages) se leen directo del repositorio para que siempre estén frescos sin volver a publicar el sitio cada pocos minutos. */
(function () {
  var RAW = 'https://raw.githubusercontent.com/soobroon-beep/Vortex-By-Nova-Nexus/main/';
  var cf = /\.pages\.dev$/.test(location.hostname);
  window.CCT_DATA = function (name) { return cf ? RAW + name : name; };
})();
