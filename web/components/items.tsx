'use client';

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  arrayMove,
  defaultAnimateLayoutChanges,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  type AnimateLayoutChanges,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ItemView } from '@gmr/shared';
import { useState, type ReactNode } from 'react';
import { assetUrl } from '@/lib/config';
import { Button, cx, Dialog } from './ui';

export function ItemImage({ item, className, size }: { item: ItemView; className?: string; size?: number }) {
  // Plain <img>: images come from the game server or R2, not from Next's image optimiser.
  return (
    <img
      src={assetUrl(item.imageUrl)}
      alt={item.title}
      draggable={false}
      loading="lazy"
      className={cx('aspect-square select-none rounded-xl bg-panel-2 object-cover', className)}
      style={size ? { width: size, height: size } : undefined}
    />
  );
}

/** Large image with its title, fact and source (FR-18, FR-65). */
export function ItemInfoDialog({ item, onClose }: { item: ItemView | null; onClose: () => void }) {
  // Keep showing the last item while the dialog slides away.
  const [shown, setShown] = useState(item);
  if (item && item !== shown) setShown(item);
  return (
    <Dialog open={item !== null} onClose={onClose}>
      {shown ? (
        <div className="flex flex-col gap-3">
          <ItemImage item={shown} className="w-full" />
          <h2 className="text-xl font-bold">{shown.title}</h2>
          {shown.fact ? <p className="text-sm leading-relaxed text-fg/90">{shown.fact}</p> : null}
          {shown.sourceUrl ? (
            <a href={shown.sourceUrl} target="_blank" rel="noreferrer" className="text-sm font-medium text-accent-fg underline">
              Эх сурвалж
            </a>
          ) : null}
          <Button variant="secondary" onClick={onClose}>
            Хаах
          </Button>
        </div>
      ) : null}
    </Dialog>
  );
}

interface RowProps {
  id: string;
  index: number;
  item: ItemView;
  count: number;
  sortable: boolean;
  onInfo: (item: ItemView) => void;
  onMove: (from: number, to: number) => void;
  meta?: ReactNode;
}

// Rows also glide when moved with ▲▼ or the keyboard, not only after a drag.
const animateLayoutChanges: AnimateLayoutChanges = (args) => defaultAnimateLayoutChanges({ ...args, wasDragging: true });

function Row({ id, index, item, count, sortable, onInfo, onMove, meta }: RowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !sortable,
    animateLayoutChanges,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cx(
        'flex items-center gap-3 rounded-2xl bg-panel p-2 pr-1.5 ring-1 ring-line transition-shadow',
        isDragging && 'relative z-10 scale-[1.02] shadow-2xl shadow-accent/30 ring-2 ring-accent',
      )}
    >
      <span
        className={cx(
          'flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-black',
          index === 0 ? 'bg-gradient-to-br from-amber-300 to-orange-500 text-neutral-950' : 'bg-panel-2 text-fg',
        )}
      >
        {index + 1}
      </span>
      <button type="button" onClick={() => onInfo(item)} className="relative shrink-0" aria-label={`${item.title} — дэлгэрэнгүй`}>
        <ItemImage item={item} className="size-14" />
        {item.fact ? (
          <span className="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-white">
            i
          </span>
        ) : null}
      </button>
      <div className="min-w-0 flex-1">
        {meta ?? <p className="truncate font-semibold">{item.title}</p>}
      </div>
      {sortable ? (
        <div className="flex items-center">
          <div className="flex flex-col">
            <button
              type="button"
              className="flex h-6 w-7 items-center justify-center rounded text-muted transition hover:text-fg active:scale-75 disabled:opacity-25"
              onClick={() => onMove(index, index - 1)}
              disabled={index === 0}
              aria-label="Дээш"
            >
              ▲
            </button>
            <button
              type="button"
              className="flex h-6 w-7 items-center justify-center rounded text-muted transition hover:text-fg active:scale-75 disabled:opacity-25"
              onClick={() => onMove(index, index + 1)}
              disabled={index === count - 1}
              aria-label="Доош"
            >
              ▼
            </button>
          </div>
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            className="flex h-12 w-9 cursor-grab touch-none items-center justify-center rounded-lg text-2xl text-muted hover:bg-panel-2 hover:text-fg active:cursor-grabbing"
            aria-label={`${item.title}-ийг чирж байрлалыг өөрчлөх`}
          >
            ⠿
          </button>
        </div>
      ) : null}
    </li>
  );
}

/** Drag-and-drop ranking list: touch, mouse and keyboard (NFR-09). */
export function RankList({
  items,
  order,
  onChange,
  renderMeta,
}: {
  items: readonly ItemView[];
  order: readonly string[];
  onChange?: (order: string[]) => void;
  renderMeta?: (item: ItemView, index: number) => ReactNode;
}) {
  const [info, setInfo] = useState<ItemView | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const byId = new Map(items.map((i) => [i.id, i]));
  const ids = order.filter((id) => byId.has(id));
  const sortable = Boolean(onChange);

  const move = (from: number, to: number) => {
    if (!onChange || to < 0 || to >= ids.length) return;
    onChange(arrayMove(ids, from, to));
  };
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    move(ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)));
  };

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ol className="flex flex-col gap-2">
            {ids.map((id, index) => (
              <Row
                key={id}
                id={id}
                index={index}
                item={byId.get(id)!}
                count={ids.length}
                sortable={sortable}
                onInfo={setInfo}
                onMove={move}
                meta={renderMeta?.(byId.get(id)!, index)}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      <ItemInfoDialog item={info} onClose={() => setInfo(null)} />
    </>
  );
}
