// Catching the DOM
// Trayendo los elementos HTML a javascript
const imgFil_canvas = document.getElementById('imagen_filtrada');
const imgOrg_canvas = document.getElementById('imagen_original');
const filtro_select = document.getElementById('filtro');

const contextImgOrg = imgOrg_canvas.getContext('2d');
const contextImgFil = imgFil_canvas.getContext('2d');

// Inisializacion de la variable que guardara la imagen
let imageUploaded = new Image();
let uploaded_image = null;

// Funcion que permite descargar la imagen filtrada
const downloadCanvas = () => {
    const dataURL = imgFil_canvas
        .toDataURL('image/png', 1.0)
        .replace('image/png', 'image/octet-stream');
    const link = document.createElement('a');
    link.download = 'my-image.png';
    link.href = dataURL;
    link.click();
};

// Funcion que permite traer a javscript la imagen que subimos a la pagina
const image_input = document.querySelector('#image_input');
image_input.addEventListener('change', function () {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
        uploaded_image = reader.result;
        document.querySelector('#display_image');
        imageUploaded.src = uploaded_image;
        console.log(uploaded_image);
    });
    reader.readAsDataURL(this.files[0]);
});

// Una vez que la imagen ya se guardo en javascript se dibuja en el canvas imgOrginal_canvas
imageUploaded.onload = () => {
    imgOrg_canvas.width = imageUploaded.width;
    imgOrg_canvas.height = imageUploaded.height;

    imgFil_canvas.width = imageUploaded.width;
    imgFil_canvas.height = imageUploaded.height;
    // Convierte la imagen a escala de grises
    contextImgOrg.filter = 'grayscale(1)';
    contextImgOrg.drawImage(
        imageUploaded,
        0,
        0,
        imageUploaded.width,
        imageUploaded.height
    );
};

// Esta funcion elimina los valores que no nos interesan (red, green, blue, alpha)
// y pasa solo los valores que nos interesan (escala de grises)
function convertTomatrix(pixels) {
    let matrix = Array(imageUploaded.height)
        .fill()
        .map(() => Array(imageUploaded.width));
    let i = 0,
        j = 0;
    for (let k = 0; k < pixels.length; k += 4) {
        matrix[i][j] = pixels[k];
        j++;
        if (j >= imageUploaded.width) {
            j = 0;
            i++;
        }
    }
    return matrix;
}

// Esta funcion pasa la matriz de valores en escala de grises a los valores (red, green, blue) para poder crear la nueva imagen
function convertToPixels(matrix, pixels) {
    let x = 0;
    //console.log(`matrix (${matrix.length} ${matrix[0].length})`);
    //console.log(`imagen (${imageUploaded.height} ${imageUploaded.width})`);

    for (const arr of matrix) {
        for (const value of arr) {
            pixels[x] = value;
            pixels[x + 1] = value;
            pixels[x + 2] = value;
            x += 4;
        }
    }
}

// Esta funcion devuelve el pixel en una cierta coordenada(x,y) y los pixeles vecinos
function getValues(matrix, x, y, matrixSize, addO = true) {
    let values = new Array();
    let aux = Math.floor(matrixSize / 2);
    for (let i = 0; i < matrixSize; i++) {
        for (let j = 0; j < matrixSize; j++) {
            if (
                x - aux + j < 0 ||
                x - aux + j >= matrix[y].length ||
                y - aux + i < 0 ||
                y - aux + i >= matrix.length
            ) {
                if (addO) values.push(0);
                continue;
            }
            values.push(matrix[y - aux + i][x - aux + j]);
        }
    }
    return values;
}

// Una vez presionado el boton submit se ejecuta esta funcion
// Esta funcion llama a las demas funciones para aplicar el filtro a nuestra imagen
function submit() {
    let imgData = contextImgOrg.getImageData(
        0,
        0,
        imageUploaded.width,
        imageUploaded.height
    );

    //contextImgOrg.filter = 'grayscale(1)';
    let matrix = convertTomatrix(imgData.data);
    let pixels = imgData.data;

    // *********** mascaras para aplicar los filtros de media y laplaciano

    const mascara9 = [
        [1, 1, 1],
        [1, 1, 1],
        [1, 1, 1]
    ];
    const mascara16 = [
        [1, 2, 1],
        [2, 4, 2],
        [1, 2, 1]
    ];

    const laplaciano1 = [
        [1, 1, 1],
        [1, -8, 1],
        [1, 1, 1]
    ];
    const laplaciano2 = [
        [0, 1, 0],
        [1, -4, 1],
        [0, 1, 0]
    ];
    const laplaciano3 = [
        [-1, -1, -1],
        [-1, 8, -1],
        [-1, -1, -1]
    ];
    const sobel1 = [
        [1, 0, -1],
        [2, 0, -2],
        [1, 0, -1]
    ];

    // De acuerdo al filtro que selecciono el usuario se llama a la funcion que le corresponde
    switch (filtro_select.selectedIndex) {
        case 0: //FILTRO MEDIANA
            convertToPixels(filtroMediana(matrix, 3), pixels);
            break;
        case 1: //FILTRO MEDIA 1/9
            convertToPixels(filtroMedia(matrix, mascara9, 9), pixels);
            break;
        case 2: //FILTRO LAPLACIANO
            convertToPixels(filtroLaplaciano(matrix, laplaciano2), pixels);
            break;
        case 3: //FILTRO SOBEL
            convertToPixels(filtroLaplaciano(matrix, sobel1), pixels);
            break;

        default:
            break;
    }
    contextImgFil.putImageData(imgData, 0, 0);
}

//***********************FILTROS***********************88
//
//MEDIANA
function filtroMediana(matrix, matrixSize) {
    // inisializacion de la matriz que contendra el los nuevos valores de la imagen (despues de aplicar el filtro)
    let matrixCopia = Array(matrix.length);
    let k = 0;
    for (const arr of matrix) {
        matrixCopia[k] = Array(arr.length);

        k++;
    }
    // Doble bucle for para recorrer todos los pixeles de nuestra imagen
    for (let y in matrix) {
        for (let x in matrix[y]) {
            let values = getValues(matrix, x, y, matrixSize, false);
            let newPixelValue;
            // se ordena los valores obtenidos de la vecindad
            values.sort();
            //encontramos la mediana
            if (values.length % 2 == 0) {
                let mid1 = values[Math.floor(values.length / 2)];
                let mid2 = values[Math.floor(values.length / 2 - 1)];
                newPixelValue = Math.round((mid1 + mid2) / 2);
            } else newPixelValue = values[Math.floor(values.length / 2)];
            matrixCopia[y][x] = newPixelValue;
        }
    }
    return matrixCopia;
}
//MEDIA
function filtroMedia(matrix, mascara, divisor) {
    // inisializacion de la matriz que contendra el los nuevos valores de la imagen (despues de aplicar el filtro)
    let matrixCopia = Array(matrix.length);
    let k = 0;
    for (const arr of matrix) {
        matrixCopia[k] = Array(arr.length);
        k++;
    }
    // Doble bucle for para recorrer todos los pixeles de nuestra imagen
    for (let y in matrix) {
        for (let x in matrix[y]) {
            let values = getValues(matrix, x, y, mascara.length);
            let suma = 0;
            let i = 0;

            // Se multiplican los valores de la vecindad y la mascara elegida y se acumulan en la variable suma
            for (const arr of mascara) {
                for (const num of arr) {
                    suma += num * values[i];
                    i++;
                    if (i >= values.length) break;
                }
            }
            let newPixelValue = Math.round(suma / divisor);

            matrixCopia[y][x] = newPixelValue;
        }
    }
    return matrixCopia;
}

function filtroLaplaciano(matrix, mascara) {
    // inisializacion de las variables mayor y menor
    // Estas variables nos serviran para mas adelante reescalar el histograma
    let mayor = Number.MIN_SAFE_INTEGER;
    let menor = Number.MAX_SAFE_INTEGER;

    // inisializacion de la matriz que contendra el los nuevos valores de la imagen (despues de aplicar el filtro)
    let matrixCopia = Array(matrix.length);
    let k = 0;
    for (const arr of matrix) {
        matrixCopia[k] = Array(arr.length);
        k++;
    }
    // Doble bucle for para recorrer todos los pixeles de nuestra imagen
    for (let y in matrix) {
        for (let x in matrix[y]) {
            let values = getValues(matrix, x, y, mascara.length);
            let suma = 0;
            let i = 0;
            // Se multiplican los valores de la vecindad y la mascara elegida y se acumulan en la variable suma
            for (const arr of mascara) {
                for (const num of arr) {
                    suma += num * values[i];
                    i++;
                    if (i >= values.length) break;
                }
            }
            let newPixelValue = Math.round(suma);
            if (mayor < newPixelValue) mayor = newPixelValue;
            if (menor > newPixelValue) menor = newPixelValue;
            matrixCopia[y][x] = newPixelValue;
        }
    }
    reescalarHistograma(matrixCopia, menor, mayor);
    return matrixCopia;
}
function reescalarHistograma(histograma, menor, mayor) {
    let m = 255 / (mayor - menor);
    let b = -m * menor;
    const ecuacion = (r) => Math.round(Math.round((m * r + b) * 100) / 100);
    for (let i in histograma) {
        for (let j in histograma[i]) {
            histograma[i][j] = ecuacion(histograma[i][j]);
        }
    }
}

function randomImage() {
    const i = Math.floor(Math.random() * 8) + 1;
    imageUploaded.src = 'images/examples/' + i + '.jpg';
}

function start() {
    randomImage();
}
start();
