
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Candle, IndicatorConfig, ChartStyle, DrawingObject, DrawingToolType } from '../types';
import { calculateHeikinAshi } from '../services/indicatorService';
import { createProgram, SHADERS, resizeCanvasToDisplaySize } from '../utils/webglUtils';

interface ChartProps {
  data: Candle[];
  indicators?: IndicatorConfig[];
  onUpdateIndicator?: (updated: IndicatorConfig) => void;
  selectedTool?: DrawingToolType;
  chartStyle?: ChartStyle;
}

// Colors
const COLOR_UP = [8, 153, 129, 255]; // #089981
const COLOR_DOWN = [242, 54, 69, 255]; // #f23645
const COLOR_VOL_UP = [8, 153, 129, 100]; 
const COLOR_VOL_DOWN = [242, 54, 69, 100];
const BACKGROUND_COLOR = [19, 23, 34, 255]; // #131722

// Helper for date formatting
const formatDate = (timestamp: number) => {
  const date = new Date(timestamp);
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
};

export const CandlestickChart: React.FC<ChartProps> = ({ 
  data, 
  indicators = [], 
  selectedTool = 'cursor',
  chartStyle = 'candle_solid'
}) => {
  // --- Refs & State ---
  const containerRef = useRef<HTMLDivElement>(null);
  const glCanvasRef = useRef<HTMLCanvasElement>(null);
  const uiCanvasRef = useRef<HTMLCanvasElement>(null);
  
  // Data Refs (avoid closure staleness in loop)
  const dataRef = useRef<Candle[]>([]);
  const indicatorsRef = useRef<IndicatorConfig[]>([]);
  const styleRef = useRef<ChartStyle>('candle_solid');

  // Drawing State
  const [drawings, setDrawings] = useState<DrawingObject[]>([]);
  const [currentDrawing, setCurrentDrawing] = useState<DrawingObject | null>(null);

  // Sync refs with props
  useEffect(() => { dataRef.current = data; }, [data]);
  useEffect(() => { indicatorsRef.current = indicators; }, [indicators]);
  useEffect(() => { styleRef.current = chartStyle; }, [chartStyle]);

  // Viewport State
  const viewState = useRef({
    offsetIndex: 0, 
    visibleCount: 80, 
    width: 0, 
    height: 0, 
    dpr: 1,
    priceMin: 0,
    priceMax: 0,
    candleWidth: 0,
    startIndex: 0,
    endIndex: 0,
    chartHeight: 0,
    bottomAxisHeight: 28,
    rightAxisWidth: 60,
  });

  const [mousePos, setMousePos] = useState<{x: number, y: number} | null>(null);
  const isDragging = useRef(false);
  const lastMouseX = useRef(0);

  // --- Coordinate Transformations ---

  // Screen X -> Data Index
  const getIndexAtX = (x: number) => {
    const { visibleCount, offsetIndex, width, dpr, rightAxisWidth } = viewState.current;
    if (width === 0) return 0;
    
    // Effective chart area width
    const chartWidth = (width / dpr) - rightAxisWidth;
    
    // Pixel to Index
    const pixelsPerCandle = chartWidth / visibleCount;
    const indexInView = x / pixelsPerCandle;
    
    const total = dataRef.current.length;
    // startIndex is the index of the first visible candle on the left
    const startIndex = Math.max(0, total - offsetIndex - visibleCount);
    
    return startIndex + indexInView;
  };

  // Screen Y -> Price
  const getPriceAtY = (y: number) => {
      const { height, dpr, priceMin, priceMax, chartHeight } = viewState.current;
      const logicalHeight = height / dpr;
      
      // Check if within chart area
      if (y > chartHeight) return priceMin;

      // Y is 0 at top, chartHeight at bottom of graph area
      // Normalized Y (0 at bottom, 1 at top)
      const normY = 1 - (y / chartHeight);
      
      const range = priceMax - priceMin;
      return priceMin + (normY * range);
  };

  // Data Index -> Screen X
  const getXAtIndex = (index: number) => {
      const { visibleCount, offsetIndex, width, dpr, rightAxisWidth } = viewState.current;
      const chartWidth = (width / dpr) - rightAxisWidth;
      const cw = chartWidth / visibleCount;
      
      const total = dataRef.current.length;
      const startIndex = Math.max(0, total - offsetIndex - visibleCount);
      
      return (index - startIndex) * cw + (cw * 0.5);
  };

  // Price -> Screen Y
  const getYAtPrice = (price: number) => {
      const { priceMin, priceMax, chartHeight } = viewState.current;
      const range = priceMax - priceMin;
      if (range === 0) return 0;
      
      const normY = (price - priceMin) / range;
      // Screen Y is inverted (0 at top)
      return chartHeight - (normY * chartHeight);
  };

  // Time -> Index (Approximation)
  const getIndexAtTime = (time: number) => {
      // Find closest existing candle
      // Performance optimization: assume sorted
      // Simple binary search or just findIndex for now
      const idx = dataRef.current.findIndex(c => c.time >= time);
      if (idx !== -1) return idx;
      
      // If time is future, extrapolate
      if (dataRef.current.length > 1) {
          const last = dataRef.current[dataRef.current.length - 1];
          const prev = dataRef.current[dataRef.current.length - 2];
          const interval = last.time - prev.time;
          const diff = time - last.time;
          return (dataRef.current.length - 1) + (diff / interval);
      }
      return 0;
  };

  // --- Render Loop (Dual Canvas) ---
  useEffect(() => {
    const glCanvas = glCanvasRef.current;
    const uiCanvas = uiCanvasRef.current;
    if (!glCanvas || !uiCanvas) return;
    
    const gl = glCanvas.getContext('webgl', { alpha: false, antialias: true });
    const ctx = uiCanvas.getContext('2d');
    if (!gl || !ctx) return;

    // WebGL Init
    const program = createProgram(gl, SHADERS.basicVertex, SHADERS.basicFragment);
    if (!program) return;
    gl.useProgram(program);

    const positionLoc = gl.getAttribLocation(program, "a_position");
    const colorLoc = gl.getAttribLocation(program, "a_color");
    const resLoc = gl.getUniformLocation(program, "u_resolution");
    const transLoc = gl.getUniformLocation(program, "u_translation");
    const scaleLoc = gl.getUniformLocation(program, "u_scale");

    const positionBuffer = gl.createBuffer();
    const colorBuffer = gl.createBuffer();

    let animationFrameId: number;

    const render = () => {
      // 1. Resize Handling
      const resizedGl = resizeCanvasToDisplaySize(glCanvas);
      const resizedUi = resizeCanvasToDisplaySize(uiCanvas);
      
      const width = glCanvas.width;
      const height = glCanvas.height;
      const dpr = window.devicePixelRatio || 1;
      
      // Update ViewState Dimensions
      viewState.current.width = width;
      viewState.current.height = height;
      viewState.current.dpr = dpr;
      
      const bottomAxisHeight = 28 * dpr;
      const rightAxisWidth = 60 * dpr;
      viewState.current.bottomAxisHeight = bottomAxisHeight / dpr;
      viewState.current.rightAxisWidth = rightAxisWidth / dpr;
      
      const chartHeight = height - bottomAxisHeight;
      const chartWidth = width - rightAxisWidth;
      viewState.current.chartHeight = chartHeight / dpr;

      // 2. Data Preparation
      let currentData = dataRef.current;
      if (styleRef.current === 'heikin_ashi') {
         currentData = calculateHeikinAshi(currentData);
      }

      const totalCandles = currentData.length;
      const { visibleCount, offsetIndex } = viewState.current;
      
      const endIndex = Math.max(0, totalCandles - offsetIndex);
      const startIndex = Math.max(0, endIndex - visibleCount);
      
      viewState.current.startIndex = startIndex;
      viewState.current.endIndex = endIndex;

      // Auto-Scale Price
      let minPrice = Infinity;
      let maxPrice = -Infinity;
      let maxVol = 0;

      // Scan visible range
      for (let i = Math.floor(startIndex); i < Math.ceil(endIndex); i++) {
        const d = currentData[i];
        if (d) {
            if (d.low < minPrice) minPrice = d.low;
            if (d.high > maxPrice) maxPrice = d.high;
            if (d.volume > maxVol) maxVol = d.volume;
        }
      }
      
      // Safety defaults
      if (minPrice === Infinity) { minPrice = 0; maxPrice = 100; }
      const padding = (maxPrice - minPrice) * 0.15;
      maxPrice += padding; 
      minPrice -= padding;
      
      viewState.current.priceMin = minPrice;
      viewState.current.priceMax = maxPrice;

      // --- WEBGL RENDERING (Candles) ---
      gl.viewport(0, 0, width, height);
      gl.clearColor(BACKGROUND_COLOR[0]/255, BACKGROUND_COLOR[1]/255, BACKGROUND_COLOR[2]/255, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      const positions: number[] = [];
      const colors: number[] = [];
      
      const logicalCandleWidth = (chartWidth / dpr) / visibleCount;
      const candleWidthPx = logicalCandleWidth * dpr;
      const priceRange = maxPrice - minPrice;
      const volHeight = chartHeight * 0.2; 

      // Helper to push rect to buffer
      const pushRect = (x: number, y: number, w: number, h: number, r: number, g: number, b: number, a: number) => {
        // WebGL coord system: (0,0) bottom-left. 
        // Our Y calculation: 
        // chartHeight is the top of the axis area (bottom of the chart area).
        // So we shift Y up by bottomAxisHeight.
        const glY = y + bottomAxisHeight; 
        
        const x2 = x + w, y2 = glY + h;
        positions.push(x, glY, x2, glY, x, y2);
        colors.push(r,g,b,a, r,g,b,a, r,g,b,a);
        positions.push(x, y2, x2, glY, x2, y2);
        colors.push(r,g,b,a, r,g,b,a, r,g,b,a);
      };

      for (let i = Math.floor(startIndex); i < endIndex; i++) {
        const d = currentData[i];
        if (!d) continue;

        const isUp = d.close >= d.open;
        const color = isUp ? COLOR_UP : COLOR_DOWN;
        const volColor = isUp ? COLOR_VOL_UP : COLOR_VOL_DOWN;

        // X coordinate (from left)
        const x = (i - startIndex) * candleWidthPx;
        const centerX = x + candleWidthPx * 0.5;
        const barW = candleWidthPx * 0.7;
        const wickW = Math.max(1 * dpr, candleWidthPx * 0.1);

        // Y coordinate mapping (0 to chartHeight)
        const mapY = (p: number) => ((p - minPrice) / priceRange) * chartHeight;
        
        const yOpen = mapY(d.open);
        const yClose = mapY(d.close);
        const yHigh = mapY(d.high);
        const yLow = mapY(d.low);

        const rectTop = Math.max(yOpen, yClose);
        const rectBottom = Math.min(yOpen, yClose);
        const rectHeight = Math.max(1 * dpr, rectTop - rectBottom);

        // Draw Volume
        const vH = (d.volume / maxVol) * volHeight;
        pushRect(centerX - barW/2, 0, barW, vH, volColor[0], volColor[1], volColor[2], volColor[3]);

        if (styleRef.current !== 'line') {
             // Wick
             pushRect(centerX - wickW/2, yLow, wickW, yHigh - yLow, color[0], color[1], color[2], 255);
             // Body
             pushRect(centerX - barW/2, rectBottom, barW, rectHeight, color[0], color[1], color[2], 255);
        }
      }

      // Draw Buffers
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(positionLoc);
      gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Uint8Array(colors), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(colorLoc);
      gl.vertexAttribPointer(colorLoc, 4, gl.UNSIGNED_BYTE, true, 0, 0);

      gl.uniform2f(resLoc, width, height);
      gl.uniform2f(transLoc, 0, 0);
      gl.uniform2f(scaleLoc, 1, 1);

      gl.drawArrays(gl.TRIANGLES, 0, positions.length / 2);

      // Draw Indicators (Lines)
      const drawLineStrip = (pts: {x:number, y:number}[], colorHex: string, widthPx: number) => {
         const linePos: number[] = [];
         const lineCol: number[] = [];
         const r = parseInt(colorHex.slice(1,3), 16);
         const g = parseInt(colorHex.slice(3,5), 16);
         const b = parseInt(colorHex.slice(5,7), 16);
         
         // Convert CSS hex to GL
         for(let i=0; i<pts.length-1; i++) {
             // GL_LINES needs pairs, simple workaround for strip
             // Better to use GL_LINE_STRIP but we're reusing the triangle buffer logic for simplicity
             // Actually let's just make a new draw call with LINE_STRIP
             linePos.push(pts[i].x, pts[i].y + bottomAxisHeight);
             lineCol.push(r,g,b,255);
         }
         // Add last point
         if(pts.length > 0) {
             const last = pts[pts.length-1];
             linePos.push(last.x, last.y + bottomAxisHeight);
             lineCol.push(r,g,b,255);
         }

         gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
         gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(linePos), gl.DYNAMIC_DRAW);
         gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

         gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
         gl.bufferData(gl.ARRAY_BUFFER, new Uint8Array(lineCol), gl.DYNAMIC_DRAW);
         gl.vertexAttribPointer(colorLoc, 4, gl.UNSIGNED_BYTE, true, 0, 0);
         
         gl.lineWidth(widthPx * dpr); 
         gl.drawArrays(gl.LINE_STRIP, 0, pts.length);
      };

      // Draw Main Line if selected
      if (styleRef.current === 'line') {
          const points = [];
          for (let i = Math.floor(startIndex); i < endIndex; i++) {
              const d = currentData[i];
              if(!d) continue;
              points.push({
                  x: (i - startIndex) * candleWidthPx + candleWidthPx * 0.5,
                  y: ((d.close - minPrice) / priceRange) * chartHeight
              });
          }
          if(points.length > 0) drawLineStrip(points, '#2962ff', 2);
      }

      // Draw Indicators
      indicatorsRef.current.forEach(ind => {
          const points = [];
          for (let i = Math.floor(startIndex); i < endIndex; i++) {
              const d = currentData[i];
              if(!d) continue;
              const val = d[ind.id];
              if (val != null) {
                  points.push({
                      x: (i - startIndex) * candleWidthPx + candleWidthPx * 0.5,
                      y: ((val - minPrice) / priceRange) * chartHeight
                  });
              }
          }
          if (points.length > 0) drawLineStrip(points, ind.color, ind.lineWidth || 1.5);
      });

      // --- 2D UI OVERLAY RENDERING ---
      ctx.clearRect(0, 0, width, height);
      ctx.scale(dpr, dpr);
      
      const logWidth = width / dpr;
      const logHeight = height / dpr;
      const logChartHeight = logHeight - (bottomAxisHeight/dpr);
      const logChartWidth = logWidth - (rightAxisWidth/dpr);

      // 1. Grid & Axes
      ctx.strokeStyle = '#2a2e39';
      ctx.lineWidth = 1;
      ctx.font = '10px monospace';
      ctx.fillStyle = '#787b86';

      // Draw Right Axis Background
      ctx.fillStyle = '#131722';
      ctx.fillRect(logChartWidth, 0, rightAxisWidth/dpr, logHeight);
      ctx.fillRect(0, logChartHeight, logWidth, bottomAxisHeight/dpr);
      
      // Draw Border
      ctx.beginPath();
      ctx.moveTo(logChartWidth, 0);
      ctx.lineTo(logChartWidth, logChartHeight);
      ctx.lineTo(0, logChartHeight);
      ctx.stroke();

      // Y-Axis Ticks (Price)
      const numYTicks = 8;
      ctx.fillStyle = '#787b86';
      for (let i = 0; i <= numYTicks; i++) {
          const ratio = i / numYTicks;
          const y = logChartHeight * (1 - ratio);
          const price = minPrice + ratio * priceRange;
          
          // Grid Line
          ctx.beginPath();
          ctx.strokeStyle = '#2a2e39';
          ctx.moveTo(0, y);
          ctx.lineTo(logChartWidth, y);
          ctx.stroke();

          // Label
          ctx.fillText(price.toFixed(2), logChartWidth + 5, y + 3);
      }

      // X-Axis Ticks (Time)
      // Determine interval for labels based on visible count
      const skip = Math.ceil(visibleCount / 6); 
      
      for (let i = Math.ceil(startIndex); i < endIndex; i++) {
          if (i % skip === 0) {
             const d = currentData[i];
             if(!d) continue;
             const x = getXAtIndex(i);
             
             // Grid Line
             ctx.beginPath();
             ctx.strokeStyle = '#2a2e39';
             ctx.moveTo(x, 0);
             ctx.lineTo(x, logChartHeight);
             ctx.stroke();

             // Label
             ctx.fillText(formatDate(d.time), x - 15, logChartHeight + 15);
          }
      }

      // 2. Drawings
      const renderLine = (p1: {x:number, y:number}, p2: {x:number, y:number}, color: string) => {
          ctx.beginPath();
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
          
          // Endpoints
          ctx.fillStyle = color;
          ctx.beginPath(); ctx.arc(p1.x, p1.y, 3, 0, Math.PI*2); ctx.fill();
          ctx.beginPath(); ctx.arc(p2.x, p2.y, 3, 0, Math.PI*2); ctx.fill();
      };

      const allDrawings = [...drawings, ...(currentDrawing ? [currentDrawing] : [])];
      
      allDrawings.forEach(d => {
          if (d.type === 'trendline') {
              const p1Index = getIndexAtTime(d.points[0].time);
              const p2Index = getIndexAtTime(d.points[1].time);
              
              const x1 = getXAtIndex(p1Index);
              const y1 = getYAtPrice(d.points[0].price);
              const x2 = getXAtIndex(p2Index);
              const y2 = getYAtPrice(d.points[1].price);
              
              renderLine({x: x1, y: y1}, {x: x2, y: y2}, d.properties?.color || '#2962ff');
          } 
          else if (d.type === 'fib') {
              const p1 = d.points[0];
              const p2 = d.points[1];
              
              const p1Index = getIndexAtTime(p1.time);
              const p2Index = getIndexAtTime(p2.time);
              const x1 = getXAtIndex(p1Index);
              const y1 = getYAtPrice(p1.price);
              const x2 = getXAtIndex(p2Index);
              const y2 = getYAtPrice(p2.price); // defines height

              // Fib Levels
              const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
              const diffY = y2 - y1; // Screen pixel difference
              const diffP = p2.price - p1.price;

              // Draw trendline first
              ctx.setLineDash([5, 5]);
              renderLine({x: x1, y: y1}, {x: x2, y: y2}, '#787b86');
              ctx.setLineDash([]);

              levels.forEach(lvl => {
                  const yLvl = y1 + diffY * lvl;
                  const priceLvl = p1.price + diffP * lvl;
                  
                  ctx.beginPath();
                  ctx.strokeStyle = d.properties?.color || '#2962ff';
                  ctx.lineWidth = 1;
                  // Extend width a bit
                  const left = Math.min(x1, x2);
                  const right = Math.max(x1, x2) + 50; 
                  
                  ctx.moveTo(left, yLvl);
                  ctx.lineTo(right, yLvl);
                  ctx.stroke();
                  
                  ctx.fillStyle = d.properties?.color || '#2962ff';
                  ctx.fillText(`${lvl} (${priceLvl.toFixed(1)})`, right + 2, yLvl + 3);
              });
          }
          else if (d.type === 'text') {
               const idx = getIndexAtTime(d.points[0].time);
               const x = getXAtIndex(idx);
               const y = getYAtPrice(d.points[0].price);
               ctx.fillStyle = d.properties?.color || '#fff';
               ctx.font = '12px sans-serif';
               ctx.fillText(d.properties?.text || '', x, y);
          }
      });

      // 3. Crosshair & Mouse UI
      if (mousePos) {
          const { x, y } = mousePos;
          if (x < logChartWidth && y < logChartHeight) {
              // Lines
              ctx.setLineDash([4, 4]);
              ctx.strokeStyle = '#9ca3af';
              ctx.lineWidth = 0.5;
              
              ctx.beginPath();
              ctx.moveTo(x, 0);
              ctx.lineTo(x, logChartHeight);
              ctx.stroke();

              ctx.beginPath();
              ctx.moveTo(0, y);
              ctx.lineTo(logChartWidth, y);
              ctx.stroke();
              ctx.setLineDash([]);

              // Labels
              const price = getPriceAtY(y);
              const index = Math.round(getIndexAtX(x));
              const candle = currentData[index];
              const timeStr = candle ? formatDate(candle.time) : '--:--';

              // Price Label (Right)
              ctx.fillStyle = '#2962ff';
              ctx.fillRect(logChartWidth, y - 10, rightAxisWidth/dpr, 20);
              ctx.fillStyle = '#fff';
              ctx.fillText(price.toFixed(2), logChartWidth + 5, y + 4);

              // Time Label (Bottom)
              ctx.fillStyle = '#2962ff';
              const timeW = 40;
              ctx.fillRect(x - timeW/2, logChartHeight, timeW, 20);
              ctx.fillStyle = '#fff';
              ctx.fillText(timeStr, x - 15, logChartHeight + 14);
          }
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform
      animationFrameId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationFrameId);
  }, [data, drawings, currentDrawing, mousePos, indicators, selectedTool, chartStyle]);

  // --- Interactions ---

  const handleWheel = (e: React.WheelEvent) => {
      e.stopPropagation();
      const delta = e.deltaY > 0 ? 1 : -1;
      const zoomSpeed = Math.max(Math.floor(viewState.current.visibleCount * 0.1), 1);
      
      const newCount = Math.max(10, Math.min(1000, viewState.current.visibleCount + delta * zoomSpeed));
      viewState.current.visibleCount = newCount;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
      const rect = uiCanvasRef.current?.getBoundingClientRect();
      if(!rect) return;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      lastMouseX.current = x;

      if (selectedTool === 'cursor') {
          isDragging.current = true;
          return;
      }
      
      const price = getPriceAtY(y);
      const index = Math.round(getIndexAtX(x));
      const candle = dataRef.current[index] || dataRef.current[dataRef.current.length-1];
      const time = candle ? candle.time : Date.now(); // Fallback

      // Eraser
      if (selectedTool === 'eraser') {
          // Simple hit test (distance < 20px)
          const hit = drawings.findIndex(d => {
               const p1 = d.points[0];
               const px1 = getXAtIndex(getIndexAtTime(p1.time));
               const py1 = getYAtPrice(p1.price);
               return Math.abs(px1 - x) < 20 && Math.abs(py1 - y) < 20;
          });
          if (hit !== -1) {
              const newDrawings = [...drawings];
              newDrawings.splice(hit, 1);
              setDrawings(newDrawings);
          }
          return;
      }

      // Start Drawing
      if (!currentDrawing) {
          if (selectedTool === 'text') {
              const text = prompt("Enter text:");
              if (text) {
                  setDrawings(prev => [...prev, {
                      id: Date.now().toString(),
                      type: 'text',
                      points: [{time, price}],
                      properties: { text, color: '#d1d4dc' }
                  }]);
              }
          } else {
              // Trendline / Fib - Start
              setCurrentDrawing({
                  id: Date.now().toString(),
                  type: selectedTool as DrawingToolType,
                  points: [{time, price}, {time, price}], // p1, p2 same initially
                  state: 'drawing',
                  properties: { color: '#2962ff' }
              });
          }
      } else {
          // Finish Drawing (Second Click)
          setDrawings(prev => [...prev, {
              ...currentDrawing,
              points: [currentDrawing.points[0], {time, price}],
              state: 'finished'
          }]);
          setCurrentDrawing(null);
      }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      const rect = uiCanvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setMousePos({ x, y });

      // Pan Chart
      if (isDragging.current) {
          const dx = x - lastMouseX.current;
          const { visibleCount, width } = viewState.current;
          const pxPerCandle = width / visibleCount;
          const moveCount = dx / pxPerCandle;
          
          let newOffset = viewState.current.offsetIndex + moveCount;
          // Clamp
          newOffset = Math.max(0, Math.min(dataRef.current.length - visibleCount/2, newOffset));
          
          viewState.current.offsetIndex = newOffset;
          lastMouseX.current = x;
          return;
      }

      // Update Current Drawing Preview
      if (currentDrawing) {
          const price = getPriceAtY(y);
          const index = Math.round(getIndexAtX(x));
          const candle = dataRef.current[index] || dataRef.current[dataRef.current.length-1];
          const time = candle ? candle.time : Date.now();

          setCurrentDrawing(prev => {
             if(!prev) return null;
             return {
                 ...prev,
                 points: [prev.points[0], { time, price }]
             };
          });
      }
  };

  const handleMouseUp = () => {
      isDragging.current = false;
  };

  const handleMouseLeave = () => {
      isDragging.current = false;
      setMousePos(null);
  };

  return (
    <div 
        ref={containerRef} 
        className="w-full h-full relative bg-bg cursor-crosshair overflow-hidden select-none"
        onWheel={handleWheel}
    >
      <canvas 
          ref={glCanvasRef} 
          className="absolute inset-0 w-full h-full"
      />
      <canvas 
          ref={uiCanvasRef} 
          className="absolute inset-0 w-full h-full z-10"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
      />
      
      {/* Legend */}
      <div className="absolute top-2 left-2 z-20 pointer-events-none text-xs flex flex-col gap-1">
          <div className="flex gap-4">
               {data.length > 0 && (() => {
                   const last = data[data.length-1];
                   return (
                       <div className="flex gap-2">
                            <span className="text-text-secondary">O <span className={last.close>=last.open?'text-trade-up':'text-trade-down'}>{last.open.toFixed(2)}</span></span>
                            <span className="text-text-secondary">H <span className={last.close>=last.open?'text-trade-up':'text-trade-down'}>{last.high.toFixed(2)}</span></span>
                            <span className="text-text-secondary">L <span className={last.close>=last.open?'text-trade-up':'text-trade-down'}>{last.low.toFixed(2)}</span></span>
                            <span className="text-text-secondary">C <span className={last.close>=last.open?'text-trade-up':'text-trade-down'}>{last.close.toFixed(2)}</span></span>
                       </div>
                   )
               })()}
          </div>
          <div className="flex flex-wrap gap-2">
              {indicators.map(ind => (
                  <span key={ind.id} style={{color: ind.color}}>
                      {ind.name}: {data.length > 0 ? (data[data.length-1][ind.id]?.toFixed(2) || 'N/A') : '-'}
                  </span>
              ))}
          </div>
      </div>
    </div>
  );
};
