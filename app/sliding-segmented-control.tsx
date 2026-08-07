"use client";

import { type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, useLayoutEffect, useRef, useState } from "react";

type Props = {
  activeKey: string | number;
  ariaLabel?: string;
  as?: "div" | "nav";
  children: ReactNode;
  className?: string;
};

type Indicator = { x: number; y: number; width: number; height: number; ready: boolean };
type DragState = { pointerId: number; startX: number; startLeft: number; width: number; moved: boolean };

export function SlidingSegmentedControl({ activeKey, ariaLabel, as = "div", children, className = "" }: Props) {
  const rootRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const programmaticClickRef = useRef(false);
  const suppressClickRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [indicator, setIndicator] = useState<Indicator>({ x: 0, y: 0, width: 0, height: 0, ready: false });

  const segmentButtons = () => Array.from(rootRef.current?.querySelectorAll<HTMLButtonElement>(":scope > button:not([data-segmented-exclude])") ?? []);

  const measureActive = () => {
    const root = rootRef.current;
    const active = root?.querySelector<HTMLElement>(":scope > button[data-segment-active='true']");
    if (!root || !active) return;
    setIndicator({ x: active.offsetLeft, y: active.offsetTop, width: active.offsetWidth, height: active.offsetHeight, ready: true });
  };

  useLayoutEffect(() => {
    measureActive();
    const root = rootRef.current;
    if (!root) return;
    const observer = new ResizeObserver(measureActive);
    observer.observe(root);
    segmentButtons().forEach((button) => observer.observe(button));
    return () => observer.disconnect();
  }, [activeKey]);

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-segment-active='true']");
    if (!button || button.disabled || button.parentElement !== rootRef.current) return;
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startLeft: indicator.x, width: indicator.width, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    const root = rootRef.current;
    if (!drag || !root || drag.pointerId !== event.pointerId) return;
    const delta = event.clientX - drag.startX;
    if (!drag.moved && Math.abs(delta) < 5) return;
    drag.moved = true;
    setDragging(true);
    event.preventDefault();
    const max = Math.max(0, root.clientWidth - drag.width);
    setIndicator((current) => ({ ...current, x: Math.min(max, Math.max(0, drag.startLeft + delta)) }));
  };

  const finishDrag = (event: ReactPointerEvent<HTMLElement>, cancelled = false) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!drag.moved || cancelled) { measureActive(); return; }

    const center = indicator.x + indicator.width / 2;
    const buttons = segmentButtons().filter((button) => !button.disabled);
    const nearest = buttons.reduce<HTMLButtonElement | null>((best, button) => {
      if (!best) return button;
      const buttonDistance = Math.abs(button.offsetLeft + button.offsetWidth / 2 - center);
      const bestDistance = Math.abs(best.offsetLeft + best.offsetWidth / 2 - center);
      return buttonDistance < bestDistance ? button : best;
    }, null);
    suppressClickRef.current = true;
    if (nearest) {
      programmaticClickRef.current = true;
      nearest.click();
      programmaticClickRef.current = false;
    }
    window.setTimeout(() => { suppressClickRef.current = false; }, 0);
    requestAnimationFrame(measureActive);
  };

  const Tag = as;
  const style = {
    "--segment-x": `${indicator.x}px`,
    "--segment-y": `${indicator.y}px`,
    "--segment-width": `${indicator.width}px`,
    "--segment-height": `${indicator.height}px`,
  } as CSSProperties;

  return <Tag
    ref={(node) => { rootRef.current = node; }}
    className={`sliding-segmented-control${indicator.ready ? " indicator-ready" : ""}${dragging ? " is-dragging" : ""}${className ? ` ${className}` : ""}`}
    aria-label={ariaLabel}
    style={style}
    onPointerDown={onPointerDown}
    onPointerMove={onPointerMove}
    onPointerUp={(event) => finishDrag(event)}
    onPointerCancel={(event) => finishDrag(event, true)}
    onClickCapture={(event) => {
      if (suppressClickRef.current && !programmaticClickRef.current) {
        event.preventDefault();
        event.stopPropagation();
        suppressClickRef.current = false;
      }
    }}
  >
    <span className="sliding-segment-indicator" aria-hidden="true" />
    {children}
  </Tag>;
}
