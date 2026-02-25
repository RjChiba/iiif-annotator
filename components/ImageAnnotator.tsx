'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnnotationData, CanvasInfo } from '@/lib/types';

type Props = {
  canvas?: CanvasInfo;
  annotations: AnnotationData[];
  selectedId?: string;
  drawMode: boolean;
  onSelect: (id?: string) => void;
  onCreate: (anno: Omit<AnnotationData, 'id' | 'createdAt'>) => void;
  onUpdate: (id: string, updates: Partial<AnnotationData>) => void;
};

type DragMode = 'draw' | 'move' | 'resize-nw' | 'resize-ne' | 'resize-sw' | 'resize-se';

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export default function ImageAnnotator({ canvas, annotations, selectedId, drawMode, onSelect, onCreate, onUpdate }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [imageSize, setImageSize] = useState({ w: 1, h: 1 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<{ mode: DragMode; startX: number; startY: number; targetId?: string; base?: AnnotationData } | null>(null);
  const [preview, setPreview] = useState<AnnotationData | null>(null);

  const imageUrl = useMemo(() => {
    if (!canvas) return undefined;
    if (canvas.imageService) return `${canvas.imageService}/full/full/0/default.jpg`;
    return canvas.imageUrl;
  }, [canvas]);

  useEffect(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setPreview(null);
  }, [canvas?.id]);

  const toImageCoords = (clientX: number, clientY: number) => {
    const container = containerRef.current;
    if (!container) return { x: 0, y: 0 };
    const rect = container.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const x = clamp((px - offset.x) / zoom, 0, imageSize.w);
    const y = clamp((py - offset.y) / zoom, 0, imageSize.h);
    return { x, y };
  };

  const onWheel: React.WheelEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault();
    const next = clamp(zoom + (event.deltaY < 0 ? 0.1 : -0.1), 0.25, 6);
    setZoom(next);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!canvas || !imageUrl) return;
    const point = toImageCoords(event.clientX, event.clientY);
    if (drawMode) {
      setDrag({ mode: 'draw', startX: point.x, startY: point.y });
      setPreview({
        id: 'preview',
        canvasId: canvas.id,
        x: point.x,
        y: point.y,
        w: 1,
        h: 1,
        text: '',
        language: '',
        createdAt: Date.now()
      });
      return;
    }

    setDrag({ mode: 'move', startX: event.clientX, startY: event.clientY });
  };

  const updateRectByDrag = (mode: DragMode, base: AnnotationData, dx: number, dy: number): AnnotationData => {
    const next = { ...base };
    if (mode === 'move') {
      next.x = clamp(base.x + dx, 0, imageSize.w - base.w);
      next.y = clamp(base.y + dy, 0, imageSize.h - base.h);
      return next;
    }
    if (mode === 'resize-se') {
      next.w = clamp(base.w + dx, 5, imageSize.w - base.x);
      next.h = clamp(base.h + dy, 5, imageSize.h - base.y);
    }
    if (mode === 'resize-sw') {
      next.x = clamp(base.x + dx, 0, base.x + base.w - 5);
      next.w = clamp(base.w - dx, 5, imageSize.w - next.x);
      next.h = clamp(base.h + dy, 5, imageSize.h - base.y);
    }
    if (mode === 'resize-ne') {
      next.y = clamp(base.y + dy, 0, base.y + base.h - 5);
      next.h = clamp(base.h - dy, 5, imageSize.h - next.y);
      next.w = clamp(base.w + dx, 5, imageSize.w - base.x);
    }
    if (mode === 'resize-nw') {
      next.x = clamp(base.x + dx, 0, base.x + base.w - 5);
      next.y = clamp(base.y + dy, 0, base.y + base.h - 5);
      next.w = clamp(base.w - dx, 5, imageSize.w - next.x);
      next.h = clamp(base.h - dy, 5, imageSize.h - next.y);
    }
    return next;
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag || !canvas) return;

    if (drag.mode === 'draw' && preview) {
      const point = toImageCoords(event.clientX, event.clientY);
      setPreview({
        ...preview,
        x: Math.min(drag.startX, point.x),
        y: Math.min(drag.startY, point.y),
        w: Math.abs(point.x - drag.startX),
        h: Math.abs(point.y - drag.startY)
      });
      return;
    }

    if (drag.targetId && drag.base) {
      const dx = (event.clientX - drag.startX) / zoom;
      const dy = (event.clientY - drag.startY) / zoom;
      const updated = updateRectByDrag(drag.mode, drag.base, dx, dy);
      onUpdate(drag.targetId, updated);
      return;
    }

    if (drag.mode === 'move' && !selectedId) {
      setOffset((prev) => ({ x: prev.x + event.movementX, y: prev.y + event.movementY }));
    }
  };

  const handlePointerUp = () => {
    if (drag?.mode === 'draw' && preview && canvas) {
      if (preview.w > 5 && preview.h > 5) {
        onCreate({
          canvasId: canvas.id,
          x: preview.x,
          y: preview.y,
          w: preview.w,
          h: preview.h,
          text: '',
          language: ''
        });
      }
      setPreview(null);
    }
    setDrag(null);
  };

  const renderHandles = (anno: AnnotationData) => {
    const handles = [
      ['resize-nw', anno.x, anno.y],
      ['resize-ne', anno.x + anno.w, anno.y],
      ['resize-sw', anno.x, anno.y + anno.h],
      ['resize-se', anno.x + anno.w, anno.y + anno.h]
    ] as const;
    return handles.map(([mode, x, y]) => (
      <button
        key={`${anno.id}-${mode}`}
        className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-blue-600"
        style={{ left: x, top: y }}
        onPointerDown={(event) => {
          event.stopPropagation();
          setDrag({ mode, startX: event.clientX, startY: event.clientY, targetId: anno.id, base: anno });
        }}
      />
    ));
  };

  return (
    <div className="relative flex h-full w-full flex-col rounded border border-slate-300 bg-slate-50">
      <div className="flex items-center gap-2 border-b border-slate-200 bg-white p-2 text-sm">
        <button className="rounded border px-2 py-1" onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }}>ズームリセット</button>
        <span>Zoom: {Math.round(zoom * 100)}%</span>
      </div>
      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden"
        onWheel={onWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {!imageUrl && <p className="p-4 text-sm text-red-600">Canvas の画像が見つかりません。</p>}
        {imageUrl && (
          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imageRef}
              src={imageUrl}
              alt={canvas?.label || 'canvas'}
              className="max-w-none select-none"
              draggable={false}
              onLoad={(event) => {
                setImageSize({ w: event.currentTarget.naturalWidth, h: event.currentTarget.naturalHeight });
              }}
            />
            <div className="absolute left-0 top-0" style={{ width: imageSize.w, height: imageSize.h }}>
              {annotations.map((anno) => (
                <button
                  key={anno.id}
                  className={`absolute border-2 text-left ${selectedId === anno.id ? 'border-blue-500 bg-blue-500/20' : 'border-amber-500 bg-amber-300/20'}`}
                  style={{ left: anno.x, top: anno.y, width: anno.w, height: anno.h }}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    onSelect(anno.id);
                    setDrag({ mode: 'move', startX: event.clientX, startY: event.clientY, targetId: anno.id, base: anno });
                  }}
                >
                  {selectedId === anno.id && renderHandles(anno)}
                </button>
              ))}
              {preview && (
                <div
                  className="absolute border-2 border-dashed border-emerald-600 bg-emerald-200/20"
                  style={{ left: preview.x, top: preview.y, width: preview.w, height: preview.h }}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
