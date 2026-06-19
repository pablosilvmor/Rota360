import { useRef, useState, useCallback, PointerEvent, DragEvent } from 'react';

export function useDraggableScroll<T extends HTMLElement>() {
  const scrollRef = useRef<T>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const onPointerDown = useCallback((e: PointerEvent<T>) => {
    if (e.button !== 0) return; // Only left-click
    if (!scrollRef.current) return;
    
    // Set the pointer capture so we don't lose the event when leaving the element bounds
    try {
      scrollRef.current.setPointerCapture(e.pointerId);
    } catch (err) {
      console.warn('Failed to set pointer capture', err);
    }
    
    setIsDragging(true);
    setStartX(e.pageX - scrollRef.current.offsetLeft);
    setScrollLeft(scrollRef.current.scrollLeft);
  }, []);

  const onPointerUp = useCallback((e: PointerEvent<T>) => {
    if (!scrollRef.current) return;
    try {
      scrollRef.current.releasePointerCapture(e.pointerId);
    } catch (err) {
      // ignore
    }
    setIsDragging(false);
  }, []);

  const onPointerCancel = useCallback((e: PointerEvent<T>) => {
    if (!scrollRef.current) return;
    try {
      scrollRef.current.releasePointerCapture(e.pointerId);
    } catch (err) {
      // ignore
    }
    setIsDragging(false);
  }, []);

  const onPointerMove = useCallback((e: PointerEvent<T>) => {
    if (!isDragging || !scrollRef.current) return;
    e.preventDefault(); // Prevent text selection/scrolling natively during movement
    
    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = (x - startX) * 1.5; // Drag speed multiplier
    scrollRef.current.scrollLeft = scrollLeft - walk;
  }, [isDragging, startX, scrollLeft]);

  // Prevent native HTML5 drag and drop from interfering
  const onDragStart = useCallback((e: DragEvent<T>) => {
    e.preventDefault();
  }, []);

  return {
    scrollRef,
    isDragging,
    events: {
      onPointerDown,
      onPointerUp,
      onPointerCancel,
      onPointerMove,
      onDragStart,
    }
  };
}
