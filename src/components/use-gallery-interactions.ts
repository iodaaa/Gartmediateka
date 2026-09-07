"use client";
import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent,
} from "react";
export const INTERNAL_MEDIA_MIME = "application/x-gart-media-assets";
export const intersects = (
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number },
) =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

export function useGalleryInteractions(
  selection: Set<string>,
  setSelection: (s: Set<string>) => void,
  currentId: string | null,
  disabled: boolean,
  move: (ids: string[], folderId: string) => Promise<unknown>,
) {
  const area = useRef<HTMLDivElement>(null);
  const badge = useRef<HTMLSpanElement>(null);
  const payload = useRef<{
    ids: string[];
    folderId: string;
    token: string;
  } | null>(null);
  const [dragCount, setDragCount] = useState(0);
  const [target, setTarget] = useState<string | null>(null);
  const [box, setBox] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const gesture = useRef<{
    x: number;
    y: number;
    seed: Set<string>;
    toggle: boolean;
    pointer: number;
    active: boolean;
  } | null>(null);
  useEffect(() => {
    const cancel = () => {
      gesture.current = null;
      setBox(null);
      payload.current = null;
      setTarget(null);
      setDragCount(0);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancel();
    };
    window.addEventListener("keydown", key);
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("blur", cancel);
    };
  }, []);
  const isInternal = (dt: DataTransfer) =>
    !!payload.current || Array.from(dt.types).includes(INTERNAL_MEDIA_MIME);
  function endDrag() {
    payload.current = null;
    setTarget(null);
    setDragCount(0);
  }
  function startDrag(e: DragEvent, id: string) {
    if (disabled || !currentId || (e.target as HTMLElement).closest("input")) {
      e.preventDefault();
      return;
    }
    const ids = selection.has(id) ? [...selection] : [id];
    setSelection(new Set(ids));
    const value = { ids, folderId: currentId, token: crypto.randomUUID() };
    payload.current = value;
    e.dataTransfer.setData(INTERNAL_MEDIA_MIME, JSON.stringify(value));
    e.dataTransfer.effectAllowed = "move";
    if (badge.current) {
      badge.current.textContent = `Перемещение: ${ids.length}`;
      e.dataTransfer.setDragImage(badge.current, 20, 12);
    }
    setDragCount(ids.length);
  }
  function folderHandlers(id: string) {
    return {
      onDragOver: (e: DragEvent) => {
        if (!isInternal(e.dataTransfer)) return;
        e.preventDefault();
        e.stopPropagation();
        const valid =
          !disabled && payload.current && id !== payload.current.folderId;
        e.dataTransfer.dropEffect = valid ? "move" : "none";
        setTarget(valid ? id : null);
      },
      onDragLeave: (e: DragEvent) => {
        if (
          !(e.currentTarget as HTMLElement).contains(
            e.relatedTarget as Node | null,
          )
        )
          setTarget(null);
      },
      onDrop: (e: DragEvent) => {
        if (!isInternal(e.dataTransfer)) return;
        e.preventDefault();
        e.stopPropagation();
        const value = payload.current;
        let valid = false;
        try {
          valid =
            !!value &&
            JSON.parse(e.dataTransfer.getData(INTERNAL_MEDIA_MIME)).token ===
              value.token;
        } catch {}
        endDrag();
        if (valid && value && !disabled && value.folderId !== id)
          void move(value.ids, id);
      },
    };
  }
  function pointerDown(e: PointerEvent<HTMLDivElement>) {
    if (
      disabled ||
      e.button !== 0 ||
      e.pointerType !== "mouse" ||
      (e.target as HTMLElement).closest(
        ".asset-card,button,input,a,select,textarea,[role=button]",
      )
    )
      return;
    const r = e.currentTarget.getBoundingClientRect();
    gesture.current = {
      x: e.clientX - r.left + e.currentTarget.scrollLeft,
      y: e.clientY - r.top + e.currentTarget.scrollTop,
      seed: new Set(selection),
      toggle: e.ctrlKey || e.metaKey,
      pointer: e.pointerId,
      active: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  function pointerMove(e: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || g.pointer !== e.pointerId) return;
    const node = e.currentTarget,
      r = node.getBoundingClientRect();
    const x =
      Math.max(r.left, Math.min(e.clientX, r.right)) - r.left + node.scrollLeft;
    const y =
      Math.max(r.top, Math.min(e.clientY, r.bottom)) - r.top + node.scrollTop;
    if (!g.active && Math.hypot(x - g.x, y - g.y) < 4) return;
    g.active = true;
    const rect = {
      left: Math.min(g.x, x) + r.left - node.scrollLeft,
      top: Math.min(g.y, y) + r.top - node.scrollTop,
      right: Math.max(g.x, x) + r.left - node.scrollLeft,
      bottom: Math.max(g.y, y) + r.top - node.scrollTop,
    };
    setBox({
      left: Math.max(rect.left, r.left),
      top: Math.max(rect.top, r.top),
      width: Math.min(rect.right, r.right) - Math.max(rect.left, r.left),
      height: Math.min(rect.bottom, r.bottom) - Math.max(rect.top, r.top),
    });
    const next = g.toggle ? new Set(g.seed) : new Set<string>();
    node
      .querySelectorAll<HTMLElement>(".asset-card[data-asset-id]")
      .forEach((card) => {
        if (intersects(rect, card.getBoundingClientRect())) {
          const id = card.dataset.assetId!;
          if (g.toggle && g.seed.has(id)) next.delete(id);
          else next.add(id);
        }
      });
    setSelection(next);
  }
  function pointerUp(e: PointerEvent<HTMLDivElement>) {
    if (gesture.current?.pointer !== e.pointerId) return;
    gesture.current = null;
    setBox(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  }
  return {
    area,
    badge,
    box,
    dragCount,
    target,
    isInternal,
    startDrag,
    endDrag,
    folderHandlers,
    pointerDown,
    pointerMove,
    pointerUp,
  };
}
