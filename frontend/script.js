const API = 'http://127.0.0.1:5000';
let matrizActual = null;

const entradaArchivo    = document.getElementById('file-input');
const zonaArrastre      = document.getElementById('drop-zone');
const etiquetaArrastre  = document.getElementById('drop-label');
const errorCarga        = document.getElementById('upload-error');
const seccionOriginal   = document.getElementById('original-section');
const seccionFiltro     = document.getElementById('filter-section');
const seccionResultados = document.getElementById('results-section');
const botonAplicar      = document.getElementById('apply-btn');
const errorFiltro       = document.getElementById('filter-error');
const contenidoResultados = document.getElementById('results-content');

zonaArrastre.addEventListener('dragover',  e => { e.preventDefault(); zonaArrastre.classList.add('drag-over'); });
zonaArrastre.addEventListener('dragleave', () => zonaArrastre.classList.remove('drag-over'));
zonaArrastre.addEventListener('drop', e => {
  e.preventDefault(); zonaArrastre.classList.remove('drag-over');
  if (e.dataTransfer.files[0]) procesarArchivo(e.dataTransfer.files[0]);
});
zonaArrastre.addEventListener('click', () => entradaArchivo.click());
entradaArchivo.addEventListener('change', () => { if (entradaArchivo.files[0]) procesarArchivo(entradaArchivo.files[0]); });

document.querySelectorAll('input[name="filter"]').forEach(r =>
  r.addEventListener('change', () => { botonAplicar.disabled = false; ocultar(errorFiltro); })
);
botonAplicar.addEventListener('click', aplicarFiltro);

function mostrarError(elem, msg) { elem.textContent = msg; elem.hidden = false; }
function ocultar(elem) { elem.hidden = true; }
function mostrar(elem) { elem.hidden = false; }

async function procesarArchivo(archivo) {
  ocultar(errorCarga);
  etiquetaArrastre.textContent = archivo.name;
  const formulario = new FormData();
  formulario.append('image', archivo);
  let datos;
  try {
    const respuesta = await fetch(`${API}/upload`, { method: 'POST', body: formulario });
    datos = await respuesta.json();
    if (!respuesta.ok) { mostrarError(errorCarga, datos.error || 'Error al cargar.'); return; }
  } catch {
    mostrarError(errorCarga, 'No se pudo conectar. Asegúrate de que el backend esté corriendo: python app.py');
    return;
  }
  matrizActual = datos.matrix;
  document.getElementById('original-img').src = `data:image/png;base64,${datos.original_image}`;
  document.getElementById('cropped-img').src  = `data:image/png;base64,${datos.cropped_image}`;
  renderizarMatriz(document.getElementById('original-matrix'), datos.matrix);
  mostrar(seccionOriginal); mostrar(seccionFiltro); ocultar(seccionResultados);
  contenidoResultados.innerHTML = '';
  seccionOriginal.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function aplicarFiltro() {
  if (!matrizActual) return;
  const tipoFiltro = document.querySelector('input[name="filter"]:checked')?.value;
  if (!tipoFiltro) { mostrarError(errorFiltro, 'Selecciona un filtro.'); return; }
  ocultar(errorFiltro);
  botonAplicar.disabled = true;
  botonAplicar.innerHTML = 'Procesando… <span class="loader"></span>';
  let datos;
  try {
    const respuesta = await fetch(`${API}/filter`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filter_type: tipoFiltro, matrix: matrizActual }),
    });
    datos = await respuesta.json();
    if (!respuesta.ok) { mostrarError(errorFiltro, datos.error || 'Error.'); return; }
  } catch {
    mostrarError(errorFiltro, 'No se pudo conectar.');
    return;
  } finally {
    botonAplicar.disabled = false;
    botonAplicar.textContent = 'Aplicar Filtro';
  }
  contenidoResultados.innerHTML = '';
  if (datos.filter_type === 'media' || datos.filter_type === 'mediana') {
    renderizarSuavizado(datos);
  } else {
    renderizarAgudizamiento(datos);
  }
  mostrar(seccionResultados);
  seccionResultados.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderizarSuavizado(datos) {
  const esMedia = datos.filter_type === 'media';
  const etiqueta = esMedia ? 'Media (promedio 3×3)' : 'Mediana 3×3';
  const pasos = datos.steps;

  const bloque0 = seccion('Resolución paso a paso — Píxel central');
  if (esMedia) {
    bloque0.append(
      cajaInfo(`
        <strong>Fórmula (Material MA475):</strong><br>
        g(x,y) = <sup>1</sup>⁄<sub>9</sub> × Σ f(vecindad 3×3)<br><br>
        Máscara utilizada: todos los coeficientes = 1/9
      `)
    );
    if (pasos) bloque0.append(pasosMedia(pasos));
  } else {
    bloque0.append(
      cajaInfo(`
        <strong>Método (Material MA475):</strong><br>
        1. Extraer los 9 (o menos en bordes) valores de la vecindad 3×3<br>
        2. Ordenarlos de menor a mayor<br>
        3. Tomar el valor central (mediana)
      `)
    );
    if (pasos) bloque0.append(pasosMediana(pasos));
  }

  const bloque1 = seccion(`Imagen inicial — Filtro ${etiqueta}`);
  bloque1.append(
    filaImagenes([
      { titulo: 'Imagen inicial (15×15 px)', src: srcRecorte() },
      { titulo: 'Versión digitalizada',      src: srcRecorte() },
    ]),
    bloqueMatriz('Matriz inicial — escala de grises (0–255)', matrizActual)
  );

  const bloque2 = seccion('Resultado tras aplicar el filtro');
  bloque2.append(
    filaImagenes([{ titulo: `Imagen resultante — Filtro ${etiqueta}`, src: datos.filtered_image }]),
    bloqueMatriz('Matriz obtenida tras aplicar el filtro (0–255)', datos.filtered_matrix)
  );

  contenidoResultados.append(bloque0, bloque1, bloque2);
}

function renderizarAgudizamiento(datos) {
  const esLap = datos.filter_type === 'laplaciano';
  const etiqueta = esLap ? 'Laplaciano' : 'Sobel';
  const pasos = datos.steps;

  const bloque0 = seccion('Resolución paso a paso — Píxel central');
  if (esLap) {
    bloque0.append(
      cajaInfo(`
        <strong>Fórmula (Material MA475):</strong><br>
        ∇²f = f(x+1,y) + f(x−1,y) + f(x,y+1) + f(x,y−1) − 4·f(x,y)<br><br>
        Luego se re-escala al intervalo [0, 255] con la recta que pasa por (mín, 0) y (máx, 255).
      `)
    );
    if (pasos) bloque0.append(pasosLaplaciano(pasos));
  } else {
    bloque0.append(
      cajaInfo(`
        <strong>Fórmulas (Material MA475):</strong><br>
        Gx = fx = operador Sobel horizontal &nbsp;|&nbsp; Gy = fy = operador Sobel vertical<br>
        <strong>|∇f| ≈ |Gx| + |Gy|</strong> (según material MA475)<br><br>
        Luego se re-escala al intervalo [0, 255].
      `)
    );
    if (pasos) bloque0.append(pasosSobel(pasos));
  }

  const bloque1 = seccion(`Imagen inicial — Filtro ${etiqueta}`);
  bloque1.append(
    filaImagenes([
      { titulo: 'Imagen inicial (15×15 px)', src: srcRecorte() },
      { titulo: 'Digitalización inicial',    src: srcRecorte() },
    ]),
    bloqueMatriz('Matriz inicial — escala de grises (0–255)', matrizActual)
  );

  const bloque2 = seccion('Resultado del filtrado (antes del re-escalado)');
  bloque2.append(bloqueMatriz('Matriz resultante del filtrado (valores reales)', datos.filtered_matrix, true));
  if (!esLap) {
    bloque2.append(
      bloqueMatriz('Matriz Gx — derivada horizontal', datos.gx_matrix, true),
      bloqueMatriz('Matriz Gy — derivada vertical',   datos.gy_matrix, true)
    );
  }

  const bloque3 = seccion('Re-escalado al intervalo [0, 255]');
  const plano = datos.filtered_matrix.flat();
  const minVal = Math.min(...plano), maxVal = Math.max(...plano);
  const fichas = elem('div', 'chips');
  fichas.append(
    ficha('Valor mínimo (x₁)', minVal),
    ficha('Valor máximo (x₂)', maxVal),
    ficha('Fórmula', `y = 255 / (${maxVal} − ${minVal}) × (x − ${minVal})`),
  );
  bloque3.append(fichas, bloqueMatriz('Matriz re-escalada (0–255)', datos.rescaled_matrix));

  const bloque4 = seccion('Imagen resultante y digitalización final');
  bloque4.append(
    filaImagenes([
      { titulo: `Imagen resultante — Filtro ${etiqueta}`,    src: datos.filtered_image },
      { titulo: 'Digitalización de la imagen resultante', src: datos.digitized_filtered },
    ])
  );

  contenidoResultados.append(bloque0, bloque1, bloque2, bloque3, bloque4);
}

function pasosMedia(p) {
  const contenedor = elem('div', 'steps-wrap');
  const fila = elem('div', 'steps-row');
  fila.append(
    matrizPaso('Vecindad 3×3\ndel píxel central', p.neighborhood, false, 'step-mat'),
    etiquetaOp('×'),
    matrizPaso('Máscara\n(1/9 ≈ 0.111)', p.mask, false, 'step-mat accent'),
    etiquetaOp('='),
    matrizPaso('Productos\n(vecindad × 1/9)', p.products, false, 'step-mat green'),
  );
  contenedor.append(fila);
  const formula = elem('div', 'step-formula');
  formula.innerHTML =
    `<span class="step-eq">Suma de productos = <strong>${p.suma}</strong></span>` +
    `<span class="step-eq">g(${p.pixel[0]}, ${p.pixel[1]}) = redondear(${p.suma}) = <strong>${p.resultado}</strong></span>`;
  contenedor.append(formula);
  return contenedor;
}

function pasosMediana(p) {
  const contenedor = elem('div', 'steps-wrap');
  const fila = elem('div', 'steps-row');
  fila.append(matrizPaso('Vecindad 3×3\ndel píxel central', p.neighborhood, false, 'step-mat'));
  contenedor.append(fila);
  const ordenados = elem('div', 'step-sorted');
  ordenados.innerHTML = `
    <div class="step-sorted-label">Valores ordenados:</div>
    <div class="step-sorted-vals">${p.valores_ordenados.map((v, i) => {
      const n = p.valores_ordenados.length;
      const medio = Math.floor(n / 2);
      const esMediana = (n % 2 === 1 && i === medio) || (n % 2 === 0 && (i === medio - 1 || i === medio));
      return `<span class="sorted-val${esMediana ? ' sorted-median' : ''}">${v}</span>`;
    }).join('')}</div>
    <div class="step-sorted-label" style="margin-top:10px">${p.formula}</div>
  `;
  contenedor.append(ordenados);
  return contenedor;
}

function pasosLaplaciano(p) {
  const contenedor = elem('div', 'steps-wrap');
  const fila = elem('div', 'steps-row');
  fila.append(
    matrizPaso('Vecindad 3×3\ndel píxel central', p.neighborhood, false, 'step-mat'),
    etiquetaOp('×'),
    matrizPaso('Máscara\nLaplaciana', p.mask, true, 'step-mat accent'),
    etiquetaOp('='),
    matrizPaso('Productos', p.products, true, 'step-mat orange'),
  );
  contenedor.append(fila);
  const formula = elem('div', 'step-formula');
  formula.innerHTML =
    `<span class="step-eq">Valor crudo = Σ productos = <strong>${p.valor_crudo}</strong></span>` +
    `<span class="step-eq">Rango: mín = <strong>${p.min}</strong>, máx = <strong>${p.max}</strong></span>` +
    `<span class="step-eq">Re-escalado: <strong>${p.formula_rescale}</strong></span>` +
    `<span class="step-eq">Resultado re-escalado en (${p.pixel[0]},${p.pixel[1]}) = <strong>${p.valor_rescalado}</strong></span>`;
  contenedor.append(formula);
  return contenedor;
}

function pasosSobel(p) {
  const contenedor = elem('div', 'steps-wrap');

  const filaX = elem('div', 'steps-row');
  filaX.append(
    matrizPaso('Vecindad 3×3', p.neighborhood, false, 'step-mat'),
    etiquetaOp('×'),
    matrizPaso('Máscara Gx\n(horizontal)', p.mask_gx, true, 'step-mat accent'),
    etiquetaOp('='),
    matrizPaso('Productos Gx', p.products_gx, true, 'step-mat cyan'),
  );
  const formulaGx = elem('div', 'step-formula');
  formulaGx.innerHTML = `<span class="step-eq">Gx = Σ productos = <strong>${p.gx_val}</strong></span>`;
  contenedor.append(filaX, formulaGx);

  const filaY = elem('div', 'steps-row');
  filaY.append(
    matrizPaso('Vecindad 3×3', p.neighborhood, false, 'step-mat'),
    etiquetaOp('×'),
    matrizPaso('Máscara Gy\n(vertical)', p.mask_gy, true, 'step-mat accent'),
    etiquetaOp('='),
    matrizPaso('Productos Gy', p.products_gy, true, 'step-mat green'),
  );
  const formulaGy = elem('div', 'step-formula');
  formulaGy.innerHTML = `<span class="step-eq">Gy = Σ productos = <strong>${p.gy_val}</strong></span>`;
  contenedor.append(filaY, formulaGy);

  const magnitud = elem('div', 'step-formula');
  magnitud.innerHTML =
    `<span class="step-eq"><strong>${p.formula_mag}</strong></span>` +
    `<span class="step-eq">Rango: mín = <strong>${p.min}</strong>, máx = <strong>${p.max}</strong></span>` +
    `<span class="step-eq">Re-escalado: <strong>${p.formula_rescale}</strong></span>` +
    `<span class="step-eq">Resultado en (${p.pixel[0]},${p.pixel[1]}) = <strong>${p.valor_rescalado}</strong></span>`;
  contenedor.append(magnitud);
  return contenedor;
}

function matrizPaso(titulo, matriz, permitirNegativos, cls) {
  const contenedor = elem('div', 'step-mat-wrap');
  const etiqueta = elem('div', 'step-mat-label');
  etiqueta.textContent = titulo;
  const tabla = construirTabla(matriz, permitirNegativos, true);
  tabla.className = cls || 'step-mat';
  contenedor.append(etiqueta, tabla);
  return contenedor;
}

function etiquetaOp(texto) {
  const e = elem('div', 'step-op-label');
  e.textContent = texto;
  return e;
}

function cajaInfo(html) {
  const caja = elem('div', 'info-box');
  caja.innerHTML = html;
  return caja;
}

function srcRecorte() { return document.getElementById('cropped-img').src; }

function seccion(titulo) {
  const div = elem('div', 'result-section');
  const h = document.createElement('h3');
  h.textContent = titulo;
  div.append(h);
  return div;
}

function filaImagenes(elementos) {
  const fila = elem('div', 'flex-row');
  fila.style.marginBottom = '18px';
  elementos.forEach(({ titulo, src }) => {
    const bloque = elem('div', 'result-block');
    const h4 = document.createElement('h4'); h4.textContent = titulo;
    const img = document.createElement('img');
    img.className = 'display-img'; img.alt = titulo;
    img.src = src.startsWith('data:') ? src : `data:image/png;base64,${src}`;
    bloque.append(h4, img);
    fila.append(bloque);
  });
  return fila;
}

function bloqueMatriz(titulo, matriz, permitirNegativos = false) {
  const bloque = elem('div', 'result-block wide');
  bloque.style.marginBottom = '18px';
  const h4 = document.createElement('h4'); h4.textContent = titulo;
  const contenedor = elem('div', 'matrix-wrap');
  contenedor.append(construirTabla(matriz, permitirNegativos));
  bloque.append(h4, contenedor);
  return bloque;
}

function ficha(etiqueta, valor) {
  const c = elem('div', 'chip');
  c.innerHTML = `${etiqueta}: <strong>${valor}</strong>`;
  return c;
}

function construirTabla(matriz, permitirNegativos = false, pequena = false) {
  const tabla = document.createElement('table');
  tabla.className = pequena ? 'matrix-table small-table' : 'matrix-table';
  const plano = matriz.flat();
  const absMax = Math.max(...plano.map(Math.abs)) || 1;
  matriz.forEach(fila => {
    const tr = document.createElement('tr');
    fila.forEach(val => {
      const td = document.createElement('td');
      td.textContent = typeof val === 'number' ? (Number.isInteger(val) ? val : val.toFixed(1)) : val;
      let r, g, b;
      if (permitirNegativos) {
        const norm = val / absMax;
        if (norm >= 0) { const i = Math.round(norm * 200); r = i; g = i; b = 255; }
        else           { const i = Math.round(-norm * 200); r = 255; g = i; b = i; }
      } else {
        const v = Math.max(0, Math.min(255, val));
        r = g = b = v;
      }
      const luminancia = r * .299 + g * .587 + b * .114;
      td.style.cssText = `background:rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)});color:${luminancia > 128 ? '#111' : '#eee'}`;
      tr.append(td);
    });
    tabla.append(tr);
  });
  return tabla;
}

function elem(etiqueta, cls) {
  const e = document.createElement(etiqueta);
  if (cls) e.className = cls;
  return e;
}

function renderizarMatriz(contenedor, matriz) {
  contenedor.innerHTML = '';
  contenedor.append(construirTabla(matriz));
}
