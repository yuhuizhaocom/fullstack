import { decodeBLP, getBLPImageData } from "war3-model";

export interface DecodedMipmap {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export function decodeBlpMipmaps(buffer: ArrayBuffer): DecodedMipmap[] {
  const blp = decodeBLP(buffer);
  if (blp.type !== 1) throw new Error(`only BLP1 is supported, received BLP${blp.type}`);
  const mips = blp.mipmaps
    .map((_mipmap, index) => ({
      index,
      width: Math.floor(blp.width / 2 ** index),
      height: Math.floor(blp.height / 2 ** index),
    }))
    .filter((mip) => mip.width > 0 && mip.height > 0)
    .map((mip) => {
      const image = getBLPImageData(blp, mip.index);
      return {
        width: image.width,
        height: image.height,
        data: new Uint8ClampedArray(image.data),
      };
    });
  if (mips.length === 0) throw new Error("BLP contains no valid mipmaps");
  return mips;
}
