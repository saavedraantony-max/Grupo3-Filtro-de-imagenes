from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
import numpy as np
import io
import base64

app = Flask(__name__)
CORS(app)


def array_a_b64(arr):
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'L')
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return base64.b64encode(buf.getvalue()).decode('utf-8')


def es_escala_grises(img):
    if img.mode == 'L':
        return True
    if img.mode in ('RGB', 'RGBA'):
        a = np.array(img.convert('RGB'))
        r, g, b = a[:,:,0].astype(int), a[:,:,1].astype(int), a[:,:,2].astype(int)
        return (np.abs(r-g).mean() < 8 and np.abs(g-b).mean() < 8 and np.abs(r-b).mean() < 8)
    return False


def recortar_centro(img_gris, tam=15):
    w, h = img_gris.size
    l, t = (w - tam) // 2, (h - tam) // 2
    return img_gris.crop((l, t, l + tam, t + tam))


def convolucion(arr, kernel):
    h, w   = arr.shape
    kh, kw = kernel.shape
    ph, pw = kh // 2, kw // 2
    relleno = np.pad(arr, ((ph, ph), (pw, pw)), mode='reflect')
    salida  = np.zeros_like(arr, dtype=np.float64)
    for i in range(h):
        for j in range(w):
            salida[i, j] = np.sum(relleno[i:i+kh, j:j+kw] * kernel)
    return salida


def reescalar(arr):
    mn, mx = float(arr.min()), float(arr.max())
    if mx == mn:
        return np.zeros_like(arr)
    return (arr - mn) / (mx - mn) * 255.0


def vecindad_pixel_central(arr):
    cy, cx = arr.shape[0] // 2, arr.shape[1] // 2
    relleno = np.pad(arr, 1, mode='reflect')
    return cy, cx, relleno[cy:cy+3, cx:cx+3]


def filtro_media(arr):
    k = np.ones((3, 3)) / 9.0
    return np.clip(convolucion(arr, k), 0, 255)


def filtro_mediana(arr):
    h, w    = arr.shape
    relleno = np.pad(arr, 1, mode='reflect')
    salida  = np.zeros_like(arr, dtype=np.float64)
    for i in range(h):
        for j in range(w):
            salida[i, j] = np.median(relleno[i:i+3, j:j+3])
    return salida


def filtro_laplaciano(arr):
    k   = np.array([[0, 1, 0], [1, -4, 1], [0, 1, 0]], dtype=np.float64)
    raw = convolucion(arr, k)
    return raw, reescalar(raw)


def filtro_sobel(arr):
    kx        = np.array([[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], dtype=np.float64)
    ky        = np.array([[-1, -2, -1], [0, 0, 0], [1, 2, 1]], dtype=np.float64)
    gx        = convolucion(arr, kx)
    gy        = convolucion(arr, ky)
    magnitud  = np.abs(gx) + np.abs(gy)
    return gx, gy, magnitud, reescalar(magnitud)


def pasos_media(arr):
    cy, cx, vecindad = vecindad_pixel_central(arr)
    vals     = vecindad.flatten().tolist()
    productos = [round(v / 9, 2) for v in vals]
    total    = sum(productos)
    resultado = int(round(total))
    return {
        'pixel':        [int(cx), int(cy)],
        'neighborhood': vecindad.astype(int).tolist(),
        'mask':         [[round(1/9, 4)]*3]*3,
        'products':     [productos[i*3:(i+1)*3] for i in range(3)],
        'suma':         round(total, 2),
        'divisor':      9,
        'resultado':    resultado,
        'formula':      'g(x,y) = (1/9) × Σ vecindad  →  redondear al entero más cercano',
    }


def pasos_mediana(arr):
    cy, cx, vecindad = vecindad_pixel_central(arr)
    vals    = sorted([int(v) for v in vecindad.flatten()])
    n       = len(vals)
    if n % 2 == 1:
        mediana = vals[n // 2]
        formula = f'n={n} (impar) → posición {n//2+1} → mediana = {mediana}'
    else:
        mediana = round((vals[n//2] + vals[n//2-1]) / 2)
        formula = f'n={n} (par) → promedio posiciones {n//2} y {n//2+1} → ({vals[n//2-1]}+{vals[n//2]})/2 = {mediana}'
    return {
        'pixel':             [int(cx), int(cy)],
        'neighborhood':      vecindad.astype(int).tolist(),
        'valores_ordenados': vals,
        'mediana':           mediana,
        'formula':           formula,
    }


def pasos_laplaciano(arr):
    mascara  = np.array([[0, 1, 0], [1, -4, 1], [0, 1, 0]], dtype=np.float64)
    cy, cx, vecindad = vecindad_pixel_central(arr)
    productos = np.round(vecindad * mascara, 2)
    val_crudo = float(productos.sum())
    raw, reescalado = filtro_laplaciano(arr)
    mn, mx   = float(raw.min()), float(raw.max())
    m        = 255 / (mx - mn) if mx != mn else 0
    b        = -m * mn
    val_resc = round(m * val_crudo + b)
    return {
        'pixel':             [int(cx), int(cy)],
        'neighborhood':      vecindad.astype(int).tolist(),
        'mask':              mascara.astype(int).tolist(),
        'products':          productos.tolist(),
        'valor_crudo':       round(val_crudo, 2),
        'min':               int(round(mn)),
        'max':               int(round(mx)),
        'formula_rescale':   f'y = 255 / ({int(round(mx))} − {int(round(mn))}) × (x − {int(round(mn))})',
        'valor_rescalado':   val_resc,
    }


def pasos_sobel(arr):
    kx = np.array([[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], dtype=np.float64)
    ky = np.array([[-1, -2, -1], [0, 0, 0], [1, 2, 1]], dtype=np.float64)
    cy, cx, vecindad = vecindad_pixel_central(arr)
    prod_x   = np.round(vecindad * kx, 2)
    prod_y   = np.round(vecindad * ky, 2)
    gx_val   = float(prod_x.sum())
    gy_val   = float(prod_y.sum())
    mag_val  = abs(gx_val) + abs(gy_val)
    gx, gy, magnitud, reescalado = filtro_sobel(arr)
    mn, mx   = float(magnitud.min()), float(magnitud.max())
    m        = 255 / (mx - mn) if mx != mn else 0
    val_resc = round(m * (mag_val - mn))
    return {
        'pixel':           [int(cx), int(cy)],
        'neighborhood':    vecindad.astype(int).tolist(),
        'mask_gx':         kx.astype(int).tolist(),
        'mask_gy':         ky.astype(int).tolist(),
        'products_gx':     prod_x.tolist(),
        'products_gy':     prod_y.tolist(),
        'gx_val':          round(gx_val, 2),
        'gy_val':          round(gy_val, 2),
        'magnitud':        round(mag_val, 2),
        'formula_mag':     f'|∇f| = |Gx| + |Gy| = |{round(gx_val,2)}| + |{round(gy_val,2)}| = {round(mag_val,2)}',
        'min':             int(round(mn)),
        'max':             int(round(mx)),
        'formula_rescale': f'y = 255 / ({int(round(mx))} − {int(round(mn))}) × (x − {int(round(mn))})',
        'valor_rescalado': val_resc,
    }


@app.route('/upload', methods=['POST'])
def subir():
    if 'image' not in request.files:
        return jsonify({'error': 'No se envió ninguna imagen.'}), 400

    archivo = request.files['image']
    if not archivo.filename.lower().endswith(('.jpg', '.jpeg')):
        return jsonify({'error': 'El archivo debe ser JPG o JPEG.'}), 400

    try:
        img = Image.open(archivo.stream)
    except Exception:
        return jsonify({'error': 'No se pudo leer la imagen.'}), 400

    if not es_escala_grises(img):
        return jsonify({'error': 'La imagen debe estar en escala de grises. Sube una imagen sin color.'}), 400

    img_gris = img.convert('L')
    w, h = img_gris.size
    if w < 15 or h < 15:
        return jsonify({'error': f'Imagen muy pequeña ({w}×{h} px). Mínimo 15×15 px.'}), 400

    recorte = recortar_centro(img_gris)
    matriz  = np.array(recorte, dtype=int).tolist()

    return jsonify({
        'original_image': array_a_b64(np.array(img_gris)),
        'cropped_image':  array_a_b64(np.array(recorte)),
        'matrix':         matriz,
    })


@app.route('/filter', methods=['POST'])
def aplicar_filtro():
    datos       = request.json or {}
    tipo_filtro = datos.get('filter_type', '')
    matriz_raw  = datos.get('matrix')

    if not matriz_raw or not tipo_filtro:
        return jsonify({'error': 'Datos incompletos.'}), 400

    arr = np.array(matriz_raw, dtype=np.float64)

    if tipo_filtro == 'media':
        filtrada = filtro_media(arr)
        return jsonify({
            'filter_type':     'media',
            'filtered_matrix': np.round(filtrada).astype(int).tolist(),
            'filtered_image':  array_a_b64(filtrada),
            'steps':           pasos_media(arr),
        })

    elif tipo_filtro == 'mediana':
        filtrada = filtro_mediana(arr)
        return jsonify({
            'filter_type':     'mediana',
            'filtered_matrix': np.round(filtrada).astype(int).tolist(),
            'filtered_image':  array_a_b64(filtrada),
            'steps':           pasos_mediana(arr),
        })

    elif tipo_filtro == 'laplaciano':
        raw, reescalado = filtro_laplaciano(arr)
        return jsonify({
            'filter_type':        'laplaciano',
            'filtered_matrix':    np.round(raw).astype(int).tolist(),
            'rescaled_matrix':    np.round(reescalado).astype(int).tolist(),
            'menor':              int(raw.min()),
            'mayor':              int(raw.max()),
            'filtered_image':     array_a_b64(reescalado),
            'digitized_filtered': array_a_b64(reescalado),
            'steps':              pasos_laplaciano(arr),
        })

    elif tipo_filtro == 'sobel':
        gx, gy, magnitud, reescalado = filtro_sobel(arr)
        return jsonify({
            'filter_type':        'sobel',
            'filtered_matrix':    np.round(magnitud).astype(int).tolist(),
            'rescaled_matrix':    np.round(reescalado).astype(int).tolist(),
            'gx_matrix':          np.round(gx).astype(int).tolist(),
            'gy_matrix':          np.round(gy).astype(int).tolist(),
            'menor':              int(magnitud.min()),
            'mayor':              int(magnitud.max()),
            'filtered_image':     array_a_b64(reescalado),
            'digitized_filtered': array_a_b64(reescalado),
            'steps':              pasos_sobel(arr),
        })

    return jsonify({'error': 'Tipo de filtro no válido.'}), 400


if __name__ == '__main__':
    app.run(debug=True, port=5000)
