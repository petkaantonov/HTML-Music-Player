import base64 from "base64-js";
import { ExpandoImage } from "player/PlayerPictureManager";

function imageLoaded(image: HTMLImageElement) {
    return new Promise((resolve, reject) => {
        if (image.complete) {
            resolve(image);
            return;
        }

        function cleanup() {
            image.onload = image.onerror = null;
        }

        image.onload = function () {
            cleanup();
            resolve(image);
        };
        image.onerror = function () {
            cleanup();
            reject(new Error(`cannot load image`));
        };
    });
}

export async function canvasToImage(canvas: HTMLCanvasElement): Promise<ExpandoImage> {
    const data = canvas.toDataURL(`image/png`).split(`base64,`)[1]!;
    const blob = new Blob([base64.toByteArray(data)], { type: `image/png` });
    const url = URL.createObjectURL(blob);
    const image = new Image() as ExpandoImage;
    image.src = url;
    image.blob = blob;
    image.isGenerated = true;
    await imageLoaded(image);
    return image;
}
