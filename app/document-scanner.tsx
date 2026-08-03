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
    intro: "Point your camera at a paper document. We detect the edges on your device and crop the scan before anything is uploaded.",
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
    intro: "Наведите камеру на бумажный документ. Границы определяются на устройстве, а обрезка выполняется до отправки снимка.",
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
    intro: "Pavērsiet kameru pret papīra dokumentu. Malas tiek noteiktas ierīcē, un apgriešana notiek pirms augšupielādes.",
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

function sampleBackground(data: Uint8ClampedArray, width: number, height: number): [number, number, number] {
  const samples: [number, number, number][] = [];
  const step = Math.max(1, Math.floor(Math.min(width, height) / 45));
  for (let x = 0; x < width; x += step) {
    for (const y of [0, height - 1]) {
      const index = (y * width + x) * 4;
      samples.push([data[index], data[index + 1], data[index + 2]]);
    }
  }
  for (let y = 0; y < height; y += step) {
    for (const x of [0, width - 1]) {
      const index = (y * width + x) * 4;
      samples.push([data[index], data[index + 1], data[index + 2]]);
    }
  }
  const result = samples.reduce((sum, value) => [sum[0] + value[0], sum[1] + value[1], sum[2] + value[2]], [0, 0, 0]);
  return samples.length ? [result[0] / samples.length, result[1] / samples.length, result[2] / samples.length] : [0, 0, 0];
}

/**
 * Finds a useful first quadrilateral without an external computer-vision SDK.
 * It intentionally falls back to safe margins when a paper edge cannot be
 * separated from its background; the four handles always let the user correct it.
 */
export function detectDocumentCorners(canvas: HTMLCanvasElement): [Point, Point, Point, Point] {
  const maxSide = 420;
  const scale = Math.min(1, maxSide / Math.max(canvas.width, canvas.height));
  const width = Math.max(24, Math.round(canvas.width * scale));
  const height = Math.max(24, Math.round(canvas.height * scale));
  const sampleCanvas = document.createElement("canvas");
  sampleCanvas.width = width;
  sampleCanvas.height = height;
  const context = sampleCanvas.getContext("2d", { willReadFrequently: true });
  if (!context) return DEFAULT_CORNERS;
  context.drawImage(canvas, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  const background = sampleBackground(pixels, width, height);
  const points: Point[] = [];
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let hits = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * 4;
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      const luminance = red * 0.299 + green * 0.587 + blue * 0.114;
      const colorDistance = Math.hypot(red - background[0], green - background[1], blue - background[2]);
      const left = (y * width + x - 1) * 4;
      const up = ((y - 1) * width + x) * 4;
      const gradient = Math.abs(red - pixels[left]) + Math.abs(red - pixels[up]) + Math.abs(green - pixels[left + 1]) + Math.abs(green - pixels[up + 1]) + Math.abs(blue - pixels[left + 2]) + Math.abs(blue - pixels[up + 2]);
      if ((colorDistance > 48 && luminance > 115) || gradient > 190) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        hits += 1;
      }
    }
  }
  const area = Math.max(0, maxX - minX) * Math.max(0, maxY - minY);
  if (hits < width * height * 0.002 || area < width * height * 0.18 || area > width * height * 0.98) return DEFAULT_CORNERS;
  const padding = 0.012;
  const left = clamp((minX / width) - padding);
  const top = clamp((minY / height) - padding);
  const right = clamp((maxX / width) + padding);
  const bottom = clamp((maxY / height) + padding);
  return [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }];
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

export function warpDocument(sourceCanvas: HTMLCanvasElement, corners: [Point, Point, Point, Point], maxWidth = 1800) {
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
  const [savedMessage, setSavedMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const streamRef = useRef<MediaStream | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const loadCanvas = useCallback((canvas: HTMLCanvasElement) => {
    sourceCanvasRef.current = canvas;
    setSourceSize({ width: canvas.width, height: canvas.height });
    setCorners(detectDocumentCorners(canvas));
    setSourceUrl(canvas.toDataURL("image/jpeg", 0.92));
    setSavedMessage("");
    setSaveError("");
    setPhase("review");
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

  const capture = () => {
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
    loadCanvas(canvas);
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
      loadCanvas(await fileToCanvas(file));
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
    setCorners((previous) => previous.map((point, index) => index === dragIndex ? { x, y } : point) as [Point, Point, Point, Point]);
  };

  const makeOutput = useCallback(() => {
    if (!sourceCanvasRef.current) throw new Error("scan_source_missing");
    return warpDocument(sourceCanvasRef.current, corners);
  }, [corners]);

  const useInApp = async () => {
    setBusy(true);
    setSaveError("");
    try {
      onUse(await canvasToFile(makeOutput()));
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
      const file = await canvasToFile(makeOutput());
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
          <p className="scanner-adjust-hint"><span aria-hidden="true">✓</span> {copy.autoDetected}. {copy.adjust}</p>
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
            <button className="primary-button" type="button" disabled={phase === "starting" || busy || Boolean(cameraError && !streamRef.current)} onClick={capture}>{busy ? copy.processing : copy.capture} <span aria-hidden="true">⌾</span></button>
          </>}
        </div>
        {phase !== "review" && <p className="scanner-device-hint">{copy.scanHint}</p>}
      </div>
    </section>
  </div>;
}
