import { useRef, useState, useCallback, MouseEvent } from 'react';

export function useDraggableScroll<T extends HTMLElement>() {
  const scrollRef = useRef<T>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const onMouseDown = useCallback((e: MouseEvent<T>) => {
    if (!scrollRef.current) return;
    setIsDragging(true);
    setStartX(e.pageX - scrollRef.current.offsetLeft);
    setScrollLeft(scrollRef.current.scrollLeft);
  }, []);

  const onMouseLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const onMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const onMouseMove = useCallback((e: MouseEvent<T>) => {
    if (!isDragging || !scrollRef.current) return;
    
    // Stop selections while dragging
    e.preventDefault();
    
    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = (x - startX) * 1.5; // multiplicador de velocidade
    scrollRef.current.scrollLeft = scrollLeft - walk;
  }, [isDragging, startX, scrollLeft]);

  return {
    scrollRef,
    isDragging,
    events: {
      onMouseDown,
      onMouseLeave,
      onMouseUp,
      onMouseMove,
    }
  };
}
