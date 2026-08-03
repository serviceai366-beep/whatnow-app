"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { ProfileLanguage } from "./profile-types";

type Point = { x: number; y: number };

type ScannerCopy = {
  title: string;
  intro: string;
  close: string;
  cameraStarting: string;
  cameraReady: string;
  cameraPermission: string;
  cameraUnavailable: string;
  cameraDenied: string;
  choosePhoto: string;
  capture: string;
  retake: string;
  adjust: string;
  autoDetected: string;
  detecting: string;
  manualAdjust: string;
  useInApp: string;
  saveGallery: string;
  saving: string;
  saved: string;
  saveHint: string;
  processing: string;
  scanButton: string;
  scanHint: string;
  captureError: string;
  saveError: string;
  noCamera: string;
};

const scannerCopy: Record<"en" | "ru" | "lv", ScannerCopy> = {
  en: {
    title: "Scan a document",
    intro: "Point your camera at a paper document. We detect the paper contour on your device, remove the surrounding desk, and crop the scan before anything is uploaded.",
    close: "Close scanner",
    cameraStarting: "Starting camera…",
    cameraReady: "Keep all four corners visible and hold the phone steady.",
    cameraPermission: "Camera access is needed to scan a paper document.",
    cameraUnavailable: "This browser cannot open a camera. Choose a photo instead.",
    cameraDenied: "Camera access was denied. Allow camera access in the browser settings, or choose a photo instead.",
    choosePhoto: "Choose a photo instead",
    capture: "Capture document",
    retake: "Retake",
    adjust: "Drag the four corners to correct the crop.",
    autoDetected: "Edges detected automatically",
    detecting: "Finding the exact paper contour…",
    manualAdjust: "We could not confirm every edge. Check and adjust the four corners.",
    useInApp: "Use in WhatNow?",
    saveGallery: "Save to gallery",
    saving: "Preparing scan…",
    saved: "The scan is ready to save.",
    saveHint: "On a phone, the share sheet lets you choose Save Image. On a computer, it downloads the JPG.",
    processing: "Cropping the document…",
    scanButton: "Scan with camera",
    scanHint: "Use your phone camera or choose a photo. The document stays on this device until you choose an action.",
    captureError: "We could not capture this frame. Try again with more light.",
    saveError: "The scan could not be saved. Try again.",
    noCamera: "Camera access is not available here.",
  },
  ru: {
    title: "Сканировать документ",
    intro: "Наведите камеру на бумажный документ. Сканер ищет именно контур листа, убирает стол вокруг него и выполняет обрезку на устройстве до отправки снимка.",
    close: "Закрыть сканер",
    cameraStarting: "Запускаем камеру…",
    cameraReady: "Держите все четыре угла в кадре и не двигайте телефон.",
    cameraPermission: "Для сканирования бумажного документа нужен доступ к камере.",
    cameraUnavailable: "Этот браузер не может открыть камеру. Вместо этого выберите фотографию.",
    cameraDenied: "Доступ к камере запрещён. Разрешите его в настройках браузера или выберите фотографию.",
    choosePhoto: "Выбрать фотографию",
    capture: "Сфотографировать документ",
    retake: "Переснять",
    adjust: "Перетащите четыре угла, чтобы исправить обрезку.",
    autoDetected: "Границы найдены автоматически",
    detecting: "Ищем точный контур листа…",
    manualAdjust: "Не удалось уверенно определить все края. Проверьте и поправьте четыре угла.",
    useInApp: "Использовать в WhatNow?",
    saveGallery: "Сохранить в галерею",
    saving: "Готовим скан…",
    saved: "Скан готов к сохранению.",
    saveHint: "На телефоне через меню «Поделиться» можно выбрать сохранение изображения. На компьютере JPG скачается.",
    processing: "Обрезаем документ…",
    scanButton: "Сканировать камерой",
    scanHint: "Используйте камеру телефона или выберите фотографию. До выбора действия документ остаётся на этом устройстве.",
    captureError: "Не удалось захватить кадр. Попробуйте при лучшем освещении.",
    saveError: "Не удалось сохранить скан. Попробуйте ещё раз.",
    noCamera: "Доступ к камере здесь недоступен.",
  },
  lv: {
    title: "Skenēt dokumentu",
    intro: "Pavērsiet kameru pret papīra dokumentu. Skeneris atrod pašas lapas kontūru, noņem galdu apkārt un apgriež attēlu ierīcē pirms augšupielādes.",
    close: "Aizvērt skeneri",
    cameraStarting: "Palaižam kameru…",
    cameraReady: "Turiet visus četrus stūrus kadrā un nekustiniet tālruni.",
    cameraPermission: "Papīra dokumenta skenēšanai nepieciešama kameras piekļuve.",
    cameraUnavailable: "Šis pārlūks nevar atvērt kameru. Tā vietā izvēlieties fotoattēlu.",
    cameraDenied: "Kameras piekļuve ir liegta. Atļaujiet to pārlūka iestatījumos vai izvēlieties fotoattēlu.",
    choosePhoto: "Izvēlēties fotoattēlu",
    capture: "Nofotografēt dokumentu",
    retake: "Fotografēt vēlreiz",
    adjust: "Velciet četrus stūrus, lai labotu apgriešanu.",
    autoDetected: "Malas noteiktas automātiski",
    detecting: "Meklējam precīzu lapas kontūru…",
    manualAdjust: "Neizdevās droši noteikt visas malas. Pārbaudiet un pielāgojiet četrus stūrus.",
    useInApp: "Izmantot WhatNow?",
    saveGallery: "Saglabāt galerijā",
    saving: "Sagatavojam skenu…",
    saved: "Skens ir gatavs saglabāšanai.",
    saveHint: "Tālrunī kopīgošanas izvēlnē varat izvēlēties attēla saglabāšanu. Datorā tiks lejupielādēts JPG.",
    processing: "Apgriežam dokumentu…",
    scanButton: "Skenēt ar kameru",
    scanHint: "Izmantojiet tālruņa kameru vai izvēlieties fotoattēlu. Dokuments paliek ierīcē, līdz izvēlaties darbību.",
    captureError: "Neizdevās uzņemt kadru. Mēģiniet labākā apgaismojumā.",
    saveError: "Neizdevās saglabāt skenu. Mēģiniet vēlreiz.",
    noCamera: "Kameras piekļuve šeit nav pieejama.",
  },
};

const DEFAULT_CORNERS: [Point, Point, Point, Point] = [
  { x: 0.08, y: 0.08 },
  { x: 0.92, y: 0.08 },
  { x: 0.92, y: 0.92 },
  { x: 0.08, y: 0.92 },
];

function clamp(value: number, min = 0.015, max = 0.985) {
  return Math.max(min, Math.min(max, value));
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

type ScanComponent = {
  pixels: number[];
  mean: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  touchesBorder: boolean;
};

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function luminancePixels(data: Uint8ClampedArray) {
  const result = new Float32Array(data.length / 4);
  for (let index = 0, pixel = 0; index < data.length; index += 4, pixel += 1) {
    result[pixel] = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
  }
  return result;
}

function medianRgb(data: Uint8ClampedArray, width: number, height: number, include: (x: number, y: number) => boolean) {
  const channels: [number[], number[], number[]] = [[], [], []];
  const stride = Math.max(1, Math.floor(Math.min(width, height) / 150));
  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      if (!include(x, y)) continue;
      const index = (y * width + x) * 4;
      channels[0].push(data[index]);
      channels[1].push(data[index + 1]);
      channels[2].push(data[index + 2]);
    }
  }
  return channels.map((channel) => median(channel)) as [number, number, number];
}

function colorDistance(first: [number, number, number], second: [number, number, number]) {
  return (first[0] - second[0]) ** 2 + (first[1] - second[1]) ** 2 + (first[2] - second[2]) ** 2;
}

function paperColorMask(data: Uint8ClampedArray, width: number, height: number) {
  // In the capture UI the document is deliberately centred. Sampling a broad
  // central area gives us the paper colour, while the outer ring describes the
  // desk/background. This remains available when OpenCV cannot start on iOS.
  const paper = medianRgb(data, width, height, (x, y) => x > width * 0.28 && x < width * 0.72 && y > height * 0.24 && y < height * 0.76);
  const background = medianRgb(data, width, height, (x, y) => x < width * 0.12 || x > width * 0.88 || y < height * 0.1 || y > height * 0.9);
  if (colorDistance(paper, background) < 14 ** 2) return null;

  const mask = new Uint8Array(width * height);
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    const index = pixel * 4;
    const color: [number, number, number] = [data[index], data[index + 1], data[index + 2]];
    const paperDistance = colorDistance(color, paper);
    const backgroundDistance = colorDistance(color, background);
    mask[pixel] = paperDistance < backgroundDistance * 0.86 ? 1 : 0;
  }
  // Multiple small closes reconnect the page through printed text without
  // allowing a single large blur to swallow the surrounding table.
  return morphClose(morphClose(morphClose(mask, width, height), width, height), width, height);
}

function borderLuminance(gray: Float32Array, width: number, height: number) {
  const values: number[] = [];
  const stride = Math.max(1, Math.floor(Math.min(width, height) / 35));
  for (let x = 0; x < width; x += stride) {
    values.push(gray[x], gray[(height - 1) * width + x]);
  }
  for (let y = 0; y < height; y += stride) {
    values.push(gray[y * width], gray[y * width + width - 1]);
  }
  return median(values);
}

function smoothLuminance(gray: Float32Array, width: number, height: number) {
  // A small box blur makes text and table grain disappear while preserving the
  // long, high-contrast boundary of a sheet of paper.
  const radius = 2;
  const integral = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y += 1) {
    let rowSum = 0;
    for (let x = 0; x < width; x += 1) {
      rowSum += gray[y * width + x];
      integral[(y + 1) * (width + 1) + x + 1] = integral[y * (width + 1) + x + 1] + rowSum;
    }
  }
  const result = new Float32Array(gray.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const left = Math.max(0, x - radius);
      const right = Math.min(width - 1, x + radius);
      const top = Math.max(0, y - radius);
      const bottom = Math.min(height - 1, y + radius);
      const rowWidth = width + 1;
      const sum = integral[(bottom + 1) * rowWidth + right + 1] - integral[top * rowWidth + right + 1] - integral[(bottom + 1) * rowWidth + left] + integral[top * rowWidth + left];
      result[y * width + x] = sum / ((right - left + 1) * (bottom - top + 1));
    }
  }
  return result;
}

function morphClose(mask: Uint8Array, width: number, height: number) {
  const dilated = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let hit = 0;
      for (let dy = -1; dy <= 1 && !hit; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height && mask[ny * width + nx]) {
            hit = 1;
            break;
          }
        }
      }
      dilated[y * width + x] = hit;
    }
  }
  const closed = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let hit = 1;
      for (let dy = -1; dy <= 1 && hit; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height || !dilated[ny * width + nx]) {
            hit = 0;
            break;
          }
        }
      }
      closed[y * width + x] = hit;
    }
  }
  return closed;
}

function connectedComponents(mask: Uint8Array, gray: Float32Array, width: number, height: number) {
  const visited = new Uint8Array(mask.length);
  const components: ScanComponent[] = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue;
    const queue = [start];
    const pixels: number[] = [];
    visited[start] = 1;
    let total = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    while (queue.length) {
      const index = queue.pop()!;
      const x = index % width;
      const y = Math.floor(index / width);
      pixels.push(index);
      total += gray[index];
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const next = ny * width + nx;
        if (mask[next] && !visited[next]) {
          visited[next] = 1;
          queue.push(next);
        }
      }
    }
    components.push({ pixels, mean: total / Math.max(1, pixels.length), minX, minY, maxX, maxY, touchesBorder: minX === 0 || minY === 0 || maxX === width - 1 || maxY === height - 1 });
  }
  return components;
}

function cross(origin: Point, a: Point, b: Point) {
  return (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);
}

function convexHull(points: Point[]) {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (sorted.length < 4) return sorted;
  const lower: Point[] = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper: Point[] = [];
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const point = sorted[index];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function polygonArea(points: Point[]) {
  return Math.abs(points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0)) / 2;
}

function pickExtreme(hull: Point[], score: (point: Point) => number, descending: boolean, used: Point[]) {
  const candidates = [...hull].sort((a, b) => {
    const difference = score(a) - score(b);
    return descending ? -difference : difference;
  });
  const spanX = Math.max(...hull.map((point) => point.x)) - Math.min(...hull.map((point) => point.x));
  const spanY = Math.max(...hull.map((point) => point.y)) - Math.min(...hull.map((point) => point.y));
  const minimumDistance = Math.max(3, Math.min(spanX, spanY) * 0.08);
  return candidates.find((candidate) => used.every((point) => Math.hypot(candidate.x - point.x, candidate.y - point.y) > minimumDistance)) ?? candidates[0];
}

function cornersFromComponent(component: ScanComponent, width: number, height: number): [Point, Point, Point, Point] | null {
  // Only the boundary is needed for the hull; dropping interior pixels keeps
  // sorting cheap even on a high-resolution phone photo.
  const componentSet = new Uint8Array(width * height);
  component.pixels.forEach((index) => { componentSet[index] = 1; });
  const boundary: Point[] = [];
  for (const index of component.pixels) {
    const x = index % width;
    const y = Math.floor(index / width);
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1 || !componentSet[index - 1] || !componentSet[index + 1] || !componentSet[index - width] || !componentSet[index + width]) {
      boundary.push({ x, y });
    }
  }
  const hull = convexHull(boundary);
  if (hull.length < 4) return null;
  const used: Point[] = [];
  const topLeft = pickExtreme(hull, (point) => point.x + point.y, false, used); used.push(topLeft);
  const topRight = pickExtreme(hull, (point) => point.x - point.y, true, used); used.push(topRight);
  const bottomRight = pickExtreme(hull, (point) => point.x + point.y, true, used); used.push(bottomRight);
  const bottomLeft = pickExtreme(hull, (point) => point.x - point.y, false, used);
  const result: [Point, Point, Point, Point] = [topLeft, topRight, bottomRight, bottomLeft];
  const area = polygonArea(result) / (width * height);
  if (!Number.isFinite(area) || area < 0.12 || area > 0.985) return null;
  return result.map((point) => ({ x: clamp(point.x / Math.max(1, width - 1)), y: clamp(point.y / Math.max(1, height - 1)) })) as [Point, Point, Point, Point];
}

function cornersFromBounds(component: ScanComponent, width: number, height: number): [Point, Point, Point, Point] | null {
  const area = ((component.maxX - component.minX) * (component.maxY - component.minY)) / (width * height);
  if (area < 0.12 || area > 0.99) return null;
  // No artificial outward padding: the previous implementation added 1.2%
  // on every side, which is precisely the table border users saw in scans.
  const left = clamp(component.minX / Math.max(1, width - 1));
  const top = clamp(component.minY / Math.max(1, height - 1));
  const right = clamp(component.maxX / Math.max(1, width - 1));
  const bottom = clamp(component.maxY / Math.max(1, height - 1));
  return [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }];
}

/**
 * Finds the largest paper-like connected region, then fits a convex
 * quadrilateral to its outer contour. This is deliberately local (no image
 * leaves the device) and is much more selective than a global bright-pixel
 * bounding box: text, table grain, and shadows are smoothed away first.
 */
function detectDocumentCornersFallback(canvas: HTMLCanvasElement): [Point, Point, Point, Point] {
  const maxSide = 520;
  const scale = Math.min(1, maxSide / Math.max(canvas.width, canvas.height));
  const width = Math.max(32, Math.round(canvas.width * scale));
  const height = Math.max(32, Math.round(canvas.height * scale));
  const sampleCanvas = document.createElement("canvas");
  sampleCanvas.width = width;
  sampleCanvas.height = height;
  const context = sampleCanvas.getContext("2d", { willReadFrequently: true });
  if (!context) return DEFAULT_CORNERS;
  context.drawImage(canvas, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height).data;
  const gray = luminancePixels(imageData);
  const smooth = smoothLuminance(gray, width, height);
  const background = borderLuminance(smooth, width, height);
  const candidates: ScanComponent[] = [];
  const colorMask = paperColorMask(imageData, width, height);
  if (colorMask) candidates.push(...connectedComponents(colorMask, smooth, width, height));
  // Several thresholds handle white paper on a dark desk as well as a light
  // desk. The best component is selected by size, contrast, and border contact.
  for (const threshold of [Math.max(112, background + 14), Math.max(132, background + 8), 178]) {
    const mask = new Uint8Array(smooth.length);
    for (let index = 0; index < smooth.length; index += 1) mask[index] = smooth[index] >= threshold ? 1 : 0;
    candidates.push(...connectedComponents(morphClose(mask, width, height), smooth, width, height));
  }
  const imageArea = width * height;
  const usable = candidates.filter((component) => component.pixels.length >= imageArea * 0.08 && component.pixels.length <= imageArea * 0.98);
  usable.sort((a, b) => {
    const score = (component: ScanComponent) => {
      const area = component.pixels.length / imageArea;
      const contrast = Math.max(0, component.mean - background) / 90;
      // A real sheet should have four visible corners. Large background masks
      // usually touch the image frame and must not outrank the centred paper.
      const borderPenalty = component.touchesBorder ? 0.2 : 1;
      const widthRatio = (component.maxX - component.minX) / width;
      const heightRatio = (component.maxY - component.minY) / height;
      return area * Math.max(0.25, contrast) * borderPenalty * Math.min(1, widthRatio * heightRatio * 1.4);
    };
    return score(b) - score(a);
  });
  for (const component of usable.slice(0, 4)) {
    const corners = cornersFromComponent(component, width, height) ?? cornersFromBounds(component, width, height);
    if (corners) return corners;
  }
  return DEFAULT_CORNERS;
}

type DetectionResult = {
  corners: [Point, Point, Point, Point];
  precise: boolean;
  confidence: number;
};

type OpenCv = {
  [key: string]: any;
  Mat: any;
};

let openCvPromise: Promise<OpenCv> | null = null;

async function loadOpenCv(): Promise<OpenCv> {
  if (!openCvPromise) {
    openCvPromise = import("@techstark/opencv-js").then(async (module) => {
      let cv = module.default as unknown as OpenCv | Promise<OpenCv>;
      if (typeof (cv as Promise<OpenCv>)?.then === "function") cv = await cv;
      if (!(cv as OpenCv)?.Mat) throw new Error("opencv_runtime_unavailable");
      return cv as OpenCv;
    }).catch((error) => {
      openCvPromise = null;
      throw error;
    });
  }
  return openCvPromise;
}

function orderQuadrilateral(points: Point[]): [Point, Point, Point, Point] | null {
  if (points.length !== 4) return null;
  const bySum = [...points].sort((a, b) => (a.x + a.y) - (b.x + b.y));
  const byDifference = [...points].sort((a, b) => (a.x - a.y) - (b.x - b.y));
  const ordered: [Point, Point, Point, Point] = [bySum[0], byDifference[3], bySum[3], byDifference[0]];
  if (new Set(ordered).size !== 4 || polygonArea(ordered) < 1) return null;
  return ordered;
}

function cornerAngleScore(previous: Point, corner: Point, next: Point) {
  const first = { x: previous.x - corner.x, y: previous.y - corner.y };
  const second = { x: next.x - corner.x, y: next.y - corner.y };
  const denominator = Math.max(1e-6, Math.hypot(first.x, first.y) * Math.hypot(second.x, second.y));
  return 1 - Math.min(1, Math.abs((first.x * second.x + first.y * second.y) / denominator));
}

function scoreQuadrilateral(points: [Point, Point, Point, Point], width: number, height: number) {
  const imageArea = width * height;
  const areaRatio = polygonArea(points) / imageArea;
  // A camera scan is expected to contain a prominent sheet. Rejecting small
  // rectangles prevents tables, text blocks, and form boxes from winning over
  // the actual paper contour.
  if (areaRatio < 0.22 || areaRatio > 0.985) return -Infinity;
  const sideRatios = points.map((point, index) => distance(point, points[(index + 1) % 4]) / Math.max(width, height));
  if (Math.min(...sideRatios) < 0.08) return -Infinity;
  const angleScore = points.reduce((sum, point, index) => sum + cornerAngleScore(points[(index + 3) % 4], point, points[(index + 1) % 4]), 0) / 4;
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const rectangularity = Math.min(1, polygonArea(points) / Math.max(1, (maxX - minX) * (maxY - minY)));
  const centerX = points.reduce((sum, point) => sum + point.x, 0) / 4 / width;
  const centerY = points.reduce((sum, point) => sum + point.y, 0) / 4 / height;
  const centerScore = 1 - Math.min(1, Math.hypot(centerX - 0.5, centerY - 0.5) / 0.71);
  const borderDistance = Math.min(minX / width, minY / height, (width - maxX) / width, (height - maxY) / height);
  const framePenalty = borderDistance < 0.006 && areaRatio > 0.82 ? 1.8 : borderDistance < 0.002 ? 0.8 : 0;
  return areaRatio * 4.4 + angleScore * 1.4 + rectangularity * 0.65 + centerScore * 0.35 - framePenalty;
}

/**
 * Uses several OpenCV edge/threshold passes and selects the strongest closed,
 * convex four-corner paper contour. Processing stays in the browser. The old
 * brightness detector is retained only as an explicitly low-confidence fallback.
 */
export async function detectDocumentCorners(canvas: HTMLCanvasElement): Promise<DetectionResult> {
  try {
    const cv = await loadOpenCv();
    const maxSide = 960;
    const scale = Math.min(1, maxSide / Math.max(canvas.width, canvas.height));
    const width = Math.max(64, Math.round(canvas.width * scale));
    const height = Math.max(64, Math.round(canvas.height * scale));
    const sampleCanvas = document.createElement("canvas");
    sampleCanvas.width = width;
    sampleCanvas.height = height;
    sampleCanvas.getContext("2d")?.drawImage(canvas, 0, 0, width, height);

    const source = cv.imread(sampleCanvas);
    const gray = new cv.Mat();
    const blurred = new cv.Mat();
    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(7, 7));
    const passes: any[] = [];
    let best: { corners: [Point, Point, Point, Point]; score: number } | null = null;
    try {
      cv.cvtColor(source, gray, cv.COLOR_RGBA2GRAY, 0);
      cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);

      for (const [low, high] of [[35, 110], [65, 190]]) {
        const edges = new cv.Mat();
        cv.Canny(blurred, edges, low, high, 3, true);
        cv.morphologyEx(edges, edges, cv.MORPH_CLOSE, kernel, new cv.Point(-1, -1), 2);
        cv.dilate(edges, edges, kernel, new cv.Point(-1, -1), 1);
        passes.push(edges);
      }
      const otsu = new cv.Mat();
      cv.threshold(blurred, otsu, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
      cv.morphologyEx(otsu, otsu, cv.MORPH_CLOSE, kernel, new cv.Point(-1, -1), 2);
      passes.push(otsu);
      const inverted = new cv.Mat();
      cv.bitwise_not(otsu, inverted);
      passes.push(inverted);

      for (const pass of passes) {
        const contours = new cv.MatVector();
        const hierarchy = new cv.Mat();
        try {
          cv.findContours(pass, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
          for (let index = 0; index < contours.size(); index += 1) {
            const contour = contours.get(index);
            const perimeter = cv.arcLength(contour, true);
            try {
              for (const epsilonRatio of [0.012, 0.02, 0.035]) {
                const approximation = new cv.Mat();
                try {
                  cv.approxPolyDP(contour, approximation, perimeter * epsilonRatio, true);
                  if (approximation.rows !== 4 || !cv.isContourConvex(approximation)) continue;
                  const raw = approximation.data32S;
                  const ordered = orderQuadrilateral(Array.from({ length: 4 }, (_, pointIndex) => ({ x: raw[pointIndex * 2], y: raw[pointIndex * 2 + 1] })));
                  if (!ordered) continue;
                  const score = scoreQuadrilateral(ordered, width, height);
                  if (!best || score > best.score) best = { corners: ordered, score };
                } finally {
                  approximation.delete();
                }
              }
            } finally {
              contour.delete();
            }
          }
        } finally {
          contours.delete();
          hierarchy.delete();
        }
      }
    } finally {
      passes.forEach((pass) => pass.delete());
      kernel.delete();
      blurred.delete();
      gray.delete();
      source.delete();
    }

    if (best && best.score >= 2.15) {
      return {
        corners: best.corners.map((point) => ({ x: clamp(point.x / Math.max(1, width - 1)), y: clamp(point.y / Math.max(1, height - 1)) })) as [Point, Point, Point, Point],
        precise: true,
        confidence: Math.min(1, best.score / 5.4),
      };
    }
  } catch {
    // A browser without WebAssembly/OpenCV still keeps manual cropping usable.
  }
  const fallback = detectDocumentCornersFallback(canvas);
  const foundPaper = fallback !== DEFAULT_CORNERS;
  return { corners: fallback, precise: foundPaper, confidence: foundPaper ? 0.58 : 0 };
}

function solveHomography(source: [Point, Point, Point, Point], width: number, height: number) {
  const destination: Point[] = [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }];
  const matrix: number[][] = [];
  for (let index = 0; index < 4; index += 1) {
    const u = destination[index].x;
    const v = destination[index].y;
    const x = source[index].x;
    const y = source[index].y;
    matrix.push([u, v, 1, 0, 0, 0, -u * x, -v * x, x]);
    matrix.push([0, 0, 0, u, v, 1, -u * y, -v * y, y]);
  }
  for (let column = 0; column < 8; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < 8; row += 1) if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivot][column])) pivot = row;
    if (Math.abs(matrix[pivot][column]) < 1e-8) return null;
    [matrix[column], matrix[pivot]] = [matrix[pivot], matrix[column]];
    const divisor = matrix[column][column];
    for (let cell = column; cell <= 8; cell += 1) matrix[column][cell] /= divisor;
    for (let row = 0; row < 8; row += 1) {
      if (row === column) continue;
      const factor = matrix[row][column];
      for (let cell = column; cell <= 8; cell += 1) matrix[row][cell] -= factor * matrix[column][cell];
    }
  }
  return matrix.map((row) => row[8]);
}

function scanOutputSize(sourceCanvas: HTMLCanvasElement, corners: [Point, Point, Point, Point], maxWidth: number) {
  const sourceWidth = sourceCanvas.width;
  const sourceHeight = sourceCanvas.height;
  const sourcePoints: [Point, Point, Point, Point] = corners.map((point) => ({ x: point.x * sourceWidth, y: point.y * sourceHeight })) as [Point, Point, Point, Point];
  const top = distance(sourcePoints[0], sourcePoints[1]);
  const bottom = distance(sourcePoints[3], sourcePoints[2]);
  const left = distance(sourcePoints[0], sourcePoints[3]);
  const right = distance(sourcePoints[1], sourcePoints[2]);
  const aspect = Math.max(0.45, Math.min(2.2, ((top + bottom) / 2) / Math.max(1, (left + right) / 2)));
  const width = Math.max(320, Math.min(maxWidth, Math.round(Math.max(top, bottom))));
  const height = Math.max(420, Math.min(Math.round(width / aspect), 2400));
  return { sourcePoints, width, height };
}

function warpDocumentFallback(sourceCanvas: HTMLCanvasElement, corners: [Point, Point, Point, Point], maxWidth = 1800) {
  const sourceWidth = sourceCanvas.width;
  const sourceHeight = sourceCanvas.height;
  const { sourcePoints, width, height } = scanOutputSize(sourceCanvas, corners, maxWidth);
  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;
  const context = output.getContext("2d");
  if (!context) return output;
  const homography = solveHomography(sourcePoints, width, height);
  if (!homography) {
    context.drawImage(sourceCanvas, sourcePoints[0].x, sourcePoints[0].y, sourcePoints[2].x - sourcePoints[0].x, sourcePoints[2].y - sourcePoints[0].y, 0, 0, width, height);
    return output;
  }
  const sourceData = sourceCanvas.getContext("2d", { willReadFrequently: true })?.getImageData(0, 0, sourceWidth, sourceHeight).data;
  if (!sourceData) return output;
  const outputData = context.createImageData(width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const denominator = homography[6] * x + homography[7] * y + 1;
      const sourceX = (homography[0] * x + homography[1] * y + homography[2]) / denominator;
      const sourceY = (homography[3] * x + homography[4] * y + homography[5]) / denominator;
      const destinationIndex = (y * width + x) * 4;
      if (sourceX < 0 || sourceY < 0 || sourceX >= sourceWidth - 1 || sourceY >= sourceHeight - 1) {
        // Keep the corners of a perspective crop white instead of producing
        // transparent pixels that become black triangles when encoded as JPG.
        outputData.data[destinationIndex] = 255;
        outputData.data[destinationIndex + 1] = 255;
        outputData.data[destinationIndex + 2] = 255;
        outputData.data[destinationIndex + 3] = 255;
        continue;
      }
      const x0 = Math.floor(sourceX);
      const y0 = Math.floor(sourceY);
      const x1 = x0 + 1;
      const y1 = y0 + 1;
      const xWeight = sourceX - x0;
      const yWeight = sourceY - y0;
      const topLeft = (y0 * sourceWidth + x0) * 4;
      const topRight = (y0 * sourceWidth + x1) * 4;
      const bottomLeft = (y1 * sourceWidth + x0) * 4;
      const bottomRight = (y1 * sourceWidth + x1) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        const topValue = sourceData[topLeft + channel] * (1 - xWeight) + sourceData[topRight + channel] * xWeight;
        const bottomValue = sourceData[bottomLeft + channel] * (1 - xWeight) + sourceData[bottomRight + channel] * xWeight;
        outputData.data[destinationIndex + channel] = topValue * (1 - yWeight) + bottomValue * yWeight;
      }
    }
  }
  context.putImageData(outputData, 0, 0);
  return output;
}

/**
 * Applies a true four-point perspective transform. OpenCV's bicubic sampler is
 * both sharper and substantially faster than the pixel-by-pixel fallback on a
 * phone. The fallback keeps scanning available when WebAssembly is blocked.
 */
export async function warpDocument(sourceCanvas: HTMLCanvasElement, corners: [Point, Point, Point, Point], maxWidth = 1800) {
  try {
    const cv = await loadOpenCv();
    const { sourcePoints, width, height } = scanOutputSize(sourceCanvas, corners, maxWidth);
    const source = cv.imread(sourceCanvas);
    const outputMat = new cv.Mat();
    const sourceMatrix = cv.matFromArray(4, 1, cv.CV_32FC2, sourcePoints.flatMap((point) => [point.x, point.y]));
    const destinationMatrix = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, width - 1, 0, width - 1, height - 1, 0, height - 1]);
    const transform = cv.getPerspectiveTransform(sourceMatrix, destinationMatrix);
    try {
      cv.warpPerspective(
        source,
        outputMat,
        transform,
        new cv.Size(width, height),
        cv.INTER_CUBIC,
        cv.BORDER_REPLICATE,
        new cv.Scalar(255, 255, 255, 255),
      );
      const output = document.createElement("canvas");
      output.width = width;
      output.height = height;
      cv.imshow(output, outputMat);
      return output;
    } finally {
      transform.delete();
      destinationMatrix.delete();
      sourceMatrix.delete();
      outputMat.delete();
      source.delete();
    }
  } catch {
    return warpDocumentFallback(sourceCanvas, corners, maxWidth);
  }
}

async function makeRefinedScan(sourceCanvas: HTMLCanvasElement, corners: [Point, Point, Point, Point], refineAutomatically: boolean) {
  const firstPass = await warpDocument(sourceCanvas, corners);
  if (!refineAutomatically) return firstPass;

  // The first pass removes most perspective. A second contour search on that
  // flatter image can then see the real paper/background boundary instead of
  // being distracted by a desk pattern or by strong lines inside a form.
  const refinement = await detectDocumentCorners(firstPass);
  const retainedArea = polygonArea(refinement.corners);
  if (!refinement.precise || refinement.confidence < 0.52 || retainedArea < 0.55 || retainedArea > 0.975) return firstPass;
  return warpDocument(firstPass, refinement.corners);
}

async function fileToCanvas(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("image_load_failed"));
      element.src = url;
    });
    const scale = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasToFile(canvas: HTMLCanvasElement) {
  return new Promise<File>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("scan_blob_failed"));
        return;
      }
      resolve(new File([blob], `whatnow-scan-${Date.now()}.jpg`, { type: "image/jpeg", lastModified: Date.now() }));
    }, "image/jpeg", 0.94);
  });
}

export function DocumentScanner({ open, locale, onClose, onUse }: { open: boolean; locale: ProfileLanguage; onClose: () => void; onUse: (file: File) => void }) {
  const copy = scannerCopy[locale === "ru" || locale === "lv" ? locale : "en"];
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<"starting" | "live" | "review">("starting");
  const [cameraError, setCameraError] = useState("");
  const [corners, setCorners] = useState<[Point, Point, Point, Point]>(DEFAULT_CORNERS);
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceSize, setSourceSize] = useState({ width: 4, height: 3 });
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [detectionMode, setDetectionMode] = useState<"detecting" | "precise" | "manual">("detecting");
  const [savedMessage, setSavedMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const streamRef = useRef<MediaStream | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const loadCanvas = useCallback(async (canvas: HTMLCanvasElement) => {
    sourceCanvasRef.current = canvas;
    setSourceSize({ width: canvas.width, height: canvas.height });
    setSourceUrl(canvas.toDataURL("image/jpeg", 0.92));
    setSavedMessage("");
    setSaveError("");
    setPhase("review");
    setBusy(true);
    setDetectionMode("detecting");
    try {
      const detection = await detectDocumentCorners(canvas);
      setCorners(detection.corners);
      setDetectionMode(detection.precise ? "precise" : "manual");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      stopStream();
      setPhase("starting");
      setSourceUrl("");
      sourceCanvasRef.current = null;
      return;
    }
    let active = true;
    setPhase("starting");
    setCameraError("");
    setSavedMessage("");
    setSaveError("");
    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        if (active) {
          setCameraError(copy.cameraUnavailable);
          setPhase("live");
        }
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setPhase("live");
      } catch (error) {
        if (!active) return;
        setCameraError(error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError") ? copy.cameraDenied : copy.cameraUnavailable);
        setPhase("live");
      }
    };
    void start();
    return () => {
      active = false;
      stopStream();
    };
  }, [copy.cameraDenied, copy.cameraUnavailable, open, stopStream]);

  useEffect(() => {
    if (!open || phase !== "review" || !sourceUrl) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose, open, phase, sourceUrl]);

  const capture = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setCameraError(copy.captureError);
      return;
    }
    const scale = Math.min(1, 2400 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    if (!canvas.width || !canvas.height) {
      setCameraError(copy.captureError);
      return;
    }
    stopStream();
    await loadCanvas(canvas);
  };

  const handlePhoto = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setCameraError(copy.cameraUnavailable);
      return;
    }
    setBusy(true);
    try {
      stopStream();
      await loadCanvas(await fileToCanvas(file));
    } catch {
      setCameraError(copy.captureError);
    } finally {
      setBusy(false);
    }
  };

  const moveCorner = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragIndex === null || !stageRef.current) return;
    const bounds = stageRef.current.getBoundingClientRect();
    const x = clamp((event.clientX - bounds.left) / bounds.width);
    const y = clamp((event.clientY - bounds.top) / bounds.height);
    setDetectionMode("manual");
    setCorners((previous) => previous.map((point, index) => index === dragIndex ? { x, y } : point) as [Point, Point, Point, Point]);
  };

  const makeOutput = useCallback(async () => {
    if (!sourceCanvasRef.current) throw new Error("scan_source_missing");
    return makeRefinedScan(sourceCanvasRef.current, corners, detectionMode === "precise");
  }, [corners, detectionMode]);

  const useInApp = async () => {
    setBusy(true);
    setSaveError("");
    try {
      onUse(await canvasToFile(await makeOutput()));
    } catch {
      setSaveError(copy.saveError);
    } finally {
      setBusy(false);
    }
  };

  const saveToGallery = async () => {
    setBusy(true);
    setSaveError("");
    try {
      const file = await canvasToFile(await makeOutput());
      const share = navigator.share;
      if (share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await share.call(navigator, { files: [file], title: "WhatNow? scan" });
      } else {
        const url = URL.createObjectURL(file);
        const link = document.createElement("a");
        link.href = url;
        link.download = file.name;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      setSavedMessage(copy.saved);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setSaveError(copy.saveError);
    } finally {
      setBusy(false);
    }
  };

  const previewAspect = sourceSize.width / Math.max(1, sourceSize.height);
  const cornerLabels = useMemo(() => ["top-left", "top-right", "bottom-right", "bottom-left"], []);

  if (!open) return null;
  return <div className="document-scanner-backdrop" role="dialog" aria-modal="true" aria-labelledby="document-scanner-title">
    <section className="document-scanner-panel">
      <header className="document-scanner-header">
        <div><p className="eyebrow">WhatNow?</p><h2 id="document-scanner-title">{copy.title}</h2></div>
        <button className="scanner-close" type="button" aria-label={copy.close} onClick={onClose}>×</button>
      </header>
      <div className="document-scanner-body">
        <p className="document-scanner-intro">{copy.intro}</p>
        {phase !== "review" ? <div className="document-scanner-camera">
          <video ref={videoRef} autoPlay playsInline muted aria-label={copy.title} />
          <div className="scanner-guide" aria-hidden="true"><span /><span /><span /><span /></div>
          <div className="scanner-camera-status">{phase === "starting" ? copy.cameraStarting : cameraError || copy.cameraReady}</div>
        </div> : <div className="document-scanner-review">
          <div ref={stageRef} className="scanner-stage" style={{ aspectRatio: previewAspect }} onPointerMove={moveCorner} onPointerUp={() => setDragIndex(null)} onPointerCancel={() => setDragIndex(null)}>
            <img src={sourceUrl} alt={copy.title} draggable={false} />
            <svg className="scanner-polygon" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polygon points={corners.map((point) => `${point.x * 100},${point.y * 100}`).join(" ")} /></svg>
            {corners.map((point, index) => <button key={cornerLabels[index]} type="button" className="scanner-handle" aria-label={`${copy.adjust} ${cornerLabels[index]}`} style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }} onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture?.(event.pointerId); setDragIndex(index); }} />)}
          </div>
          <p className={`scanner-adjust-hint scanner-adjust-${detectionMode}`} role="status"><span aria-hidden="true">{detectionMode === "precise" ? "✓" : detectionMode === "detecting" ? "◌" : "!"}</span> {detectionMode === "detecting" ? copy.detecting : detectionMode === "precise" ? `${copy.autoDetected}. ${copy.adjust}` : copy.manualAdjust}</p>
          {savedMessage && <p className="scanner-saved" role="status">{savedMessage} {copy.saveHint}</p>}
          {saveError && <p className="input-error" role="alert">{saveError}</p>}
        </div>}
        {phase !== "review" && cameraError && <p className="scanner-inline-error" role="alert">{cameraError}</p>}
        <div className="document-scanner-actions">
          {phase === "review" ? <>
            <button className="secondary-button" type="button" onClick={() => { setPhase("live"); setCameraError(""); setSourceUrl(""); void (async () => { if (!navigator.mediaDevices?.getUserMedia) return; try { const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false }); streamRef.current = stream; if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => undefined); } } catch { setCameraError(copy.cameraDenied); } })(); }}>{copy.retake}</button>
            <button className="secondary-button" type="button" disabled={busy} onClick={() => void saveToGallery()}>{busy ? copy.saving : copy.saveGallery}</button>
            <button className="primary-button" type="button" disabled={busy} onClick={() => void useInApp()}>{busy ? copy.processing : copy.useInApp} <span aria-hidden="true">→</span></button>
          </> : <>
            <button className="secondary-button" type="button" onClick={() => fileInputRef.current?.click()}>{copy.choosePhoto}</button>
            <input ref={fileInputRef} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp,image/heic,.jpg,.jpeg,.png,.webp,.heic" onChange={(event) => void handlePhoto(event.target.files?.[0])} />
            <button className="primary-button" type="button" disabled={phase === "starting" || busy || Boolean(cameraError && !streamRef.current)} onClick={() => void capture()}>{busy ? copy.processing : copy.capture} <span aria-hidden="true">⌾</span></button>
          </>}
        </div>
        {phase !== "review" && <p className="scanner-device-hint">{copy.scanHint}</p>}
      </div>
    </section>
  </div>;
}
