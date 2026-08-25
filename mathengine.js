/**
 * mathengine.js - Core Mathematical and Graphical Computation Engine
 */

/** APP STATE **/
export const palette = ["#3b82f6", "#ef4444", "#22c55e", "#a855f7", "#eab308"];

export const state = {
  webglEnabled: false,
  gridStyle: 'square',
  expressions: [
    { id: 1, raw: "y = x^2 - 4", active: true, color: palette[0] },
    { id: 2, raw: "integral(x, 1, 3)", active: true, color: palette[1] },
    { id: 3, raw: "vector(4, 3)", active: true, color: palette[2] }
  ],
  centerX: 0,
  centerY: 0,
  zoomScale: 10
};

export let canvas2d, ctx2d, canvasWebgl, gl;

/**
 * Initializes canvas elements and viewport bindings
 */
export function initEngine() {
  canvas2d = document.getElementById('graphCanvas');
  ctx2d = canvas2d.getContext('2d');
  canvasWebgl = document.getElementById('webglCanvas');
  gl = canvasWebgl.getContext('webgl');
}

/**
 * Keyword Pre-Processing (Symbol replacement & aliases)
 */
export function preprocessKeywords(input) {
  let str = input;
  str = str.replace(/\bnotequal\b/g, '≠');
  str = str.replace(/\binfinity\b/g, '∞');
  str = str.replace(/\b(doubleintegral|integral2)\b/g, '∬');
  str = str.replace(/\b(tripleintegral|integral3)\b/g, '∭');
  str = str.replace(/\b(lineintegral|contourintegral)\b/g, '∮');
  str = str.replace(/\bintegral\b/g, '∫');
  str = str.replace(/\b(summation|sum)\b/g, '∑');
  return str;
}

/**
 * Calculates current coordinate boundaries
 */
export function getViewportBounds() {
  const w = canvas2d.width;
  const h = canvas2d.height;
  const aspect = w / h;
  const ySpan = state.zoomScale;
  const xSpan = ySpan * aspect;

  return {
    minX: state.centerX - xSpan,
    maxX: state.centerX + xSpan,
    minY: state.centerY - ySpan,
    maxY: state.centerY + ySpan,
    unitsPerPixel: (ySpan * 2) / h
  };
}

/**
 * Dynamic Tick Step Calculation
 */
export function calculateDynamicStep(scale) {
  const minPixelSpacing = 60;
  const rawStep = minPixelSpacing / scale;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const residual = rawStep / mag;
  if (residual < 2) return mag;
  if (residual < 5) return 2 * mag;
  return 5 * mag;
}

/**
 * Solves single-variable linear equations (Ax + B = Cx + D)
 */
export function solveLinearEquation(input) {
  const parts = input.split('=').map(s => s.trim());
  if (parts.length !== 2) throw new Error("Invalid equation structure");

  const varMatch = input.match(/[a-zA-Z]/);
  const varChar = varMatch ? varMatch[0] : 'x';

  function parseLinearSide(exprStr) {
    let expr = exprStr.replace(/\s+/g, '');
    expr = expr.replace(new RegExp(`(?<=[+-]|^)${varChar}`, 'g'), `1${varChar}`);
    expr = expr.replace(new RegExp(`(?<=[+-]|^)-${varChar}`, 'g'), `-1${varChar}`);

    const tokens = expr.match(/[+-]?[^+-]+/g) || [];
    let coeff = 0;
    let constant = 0;

    for (const token of tokens) {
      if (token.includes(varChar)) {
        const val = parseFloat(token.replace(varChar, ''));
        coeff += isNaN(val) ? 1 : val;
      } else {
        const val = parseFloat(token);
        if (!isNaN(val)) constant += val;
      }
    }
    return { coeff, constant };
  }

  const left = parseLinearSide(parts[0]);
  const right = parseLinearSide(parts[1]);

  const netCoeff = left.coeff - right.coeff;
  const netConst = right.constant - left.constant;

  if (Math.abs(netCoeff) < 1e-12) {
    if (Math.abs(netConst) < 1e-12) return { varName: varChar, value: "Infinite solutions" };
    return { varName: varChar, value: "No solution" };
  }

  const xVal = netConst / netCoeff;
  return { 
    varName: varChar, 
    value: Number.isInteger(xVal) ? xVal : parseFloat(xVal.toFixed(6)) 
  };
}

/**
 * Numerical Integration (Simpson's 1/3 Rule with Trapezoidal Fallback)
 */
export function integrateNumerical(funcExpr, a, b, n = 100) {
  if (n % 2 !== 0) n += 1;
  const h = (b - a) / n;

  const f = (xVal) => {
    try {
      return math.evaluate(funcExpr, { x: xVal });
    } catch (e) {
      return NaN;
    }
  };

  let sum = f(a) + f(b);

  for (let i = 1; i < n; i++) {
    const x = a + i * h;
    const weight = i % 2 === 0 ? 2 : 4;
    const fx = f(x);
    if (isNaN(fx)) return integrateTrapezoidal(f, a, b, n);
    sum += weight * fx;
  }

  const result = (h / 3) * sum;
  return Number.isInteger(result) ? result : parseFloat(result.toFixed(6));
}

function integrateTrapezoidal(f, a, b, n) {
  const h = (b - a) / n;
  let sum = 0.5 * (f(a) + f(b));
  for (let i = 1; i < n; i++) {
    sum += f(a + i * h);
  }
  return parseFloat((sum * h).toFixed(6));
}

/**
 * Core Render Pipeline
 */
export function draw() {
  drawGridAndAxes();
  drawExpressions();
}

/**
 * Grid Rendering with Dynamic Numeric Labels
 */
export function drawGridAndAxes() {
  ctx2d.clearRect(0, 0, canvas2d.width, canvas2d.height);
  const bounds = getViewportBounds();
  const { minX, maxX, minY, maxY } = bounds;
  const w = canvas2d.width, h = canvas2d.height;

  const toCanvasX = (wx) => ((wx - minX) / (maxX - minX)) * w;
  const toCanvasY = (wy) => h - (((wy - minY) / (maxY - minY)) * h);

  ctx2d.save();

  const scale = h / (maxY - minY);
  const step = calculateDynamicStep(scale);

  ctx2d.strokeStyle = '#e2e8f0';
  ctx2d.lineWidth = 1;

  if (state.gridStyle === 'square') {
    const startX = Math.floor(minX / step) * step;
    const startY = Math.floor(minY / step) * step;

    for (let x = startX; x <= maxX; x += step) {
      ctx2d.beginPath(); ctx2d.moveTo(toCanvasX(x), 0); ctx2d.lineTo(toCanvasX(x), h); ctx2d.stroke();
    }
    for (let y = startY; y <= maxY; y += step) {
      ctx2d.beginPath(); ctx2d.moveTo(0, toCanvasY(y)); ctx2d.lineTo(w, toCanvasY(y)); ctx2d.stroke();
    }
  } 
  else if (state.gridStyle === 'polar') {
    const maxRadius = Math.hypot(Math.max(Math.abs(minX), Math.abs(maxX)), Math.max(Math.abs(minY), Math.abs(maxY)));
    for (let r = step; r <= maxRadius; r += step) {
      ctx2d.beginPath();
      ctx2d.arc(toCanvasX(0), toCanvasY(0), r / bounds.unitsPerPixel, 0, 2 * Math.PI);
      ctx2d.stroke();
    }
    for (let a = 0; a < 360; a += 30) {
      const rad = (a * Math.PI) / 180;
      ctx2d.beginPath();
      ctx2d.moveTo(toCanvasX(0), toCanvasY(0));
      ctx2d.lineTo(toCanvasX(Math.cos(rad) * maxRadius), toCanvasY(Math.sin(rad) * maxRadius));
      ctx2d.stroke();
    }
  } 
  else if (state.gridStyle === 'isometric') {
    const s = step * 1.5;
    const diagMax = (Math.abs(maxX - minX) + Math.abs(maxY - minY)) * 2;
    const startX = Math.floor(minX / s) * s;
    for (let x = startX; x <= maxX; x += s) {
      ctx2d.beginPath(); ctx2d.moveTo(toCanvasX(x), 0); ctx2d.lineTo(toCanvasX(x), h); ctx2d.stroke();
    }
    const tan30 = Math.tan(Math.PI / 6);
    for (let c = -diagMax; c <= diagMax; c += s) {
      ctx2d.beginPath();
      ctx2d.moveTo(toCanvasX(minX), toCanvasY(tan30 * minX + c));
      ctx2d.lineTo(toCanvasX(maxX), toCanvasY(tan30 * maxX + c));
      ctx2d.stroke();

      ctx2d.beginPath();
      ctx2d.moveTo(toCanvasX(minX), toCanvasY(-tan30 * minX + c));
      ctx2d.lineTo(toCanvasX(maxX), toCanvasY(-tan30 * maxX + c));
      ctx2d.stroke();
    }
  } 
  else if (state.gridStyle === 'triangular') {
    const s = step * 1.5;
    const hStep = s * (Math.sqrt(3) / 2);
    const diagMax = (Math.abs(maxX - minX) + Math.abs(maxY - minY)) * 2;
    const startY = Math.floor(minY / hStep) * hStep;
    for (let y = startY; y <= maxY; y += hStep) {
      ctx2d.beginPath(); ctx2d.moveTo(0, toCanvasY(y)); ctx2d.lineTo(w, toCanvasY(y)); ctx2d.stroke();
    }
    const tan60 = Math.tan(Math.PI / 3);
    for (let c = -diagMax; c <= diagMax; c += s) {
      ctx2d.beginPath();
      ctx2d.moveTo(toCanvasX(minX), toCanvasY(tan60 * minX + c));
      ctx2d.lineTo(toCanvasX(maxX), toCanvasY(tan60 * maxX + c));
      ctx2d.stroke();

      ctx2d.beginPath();
      ctx2d.moveTo(toCanvasX(minX), toCanvasY(-tan60 * minX + c));
      ctx2d.lineTo(toCanvasX(maxX), toCanvasY(-tan60 * maxX + c));
      ctx2d.stroke();
    }
  }

  // Main Cartesian Axes
  ctx2d.strokeStyle = '#475569';
  ctx2d.lineWidth = 1.5;
  const yAxis = toCanvasY(0), xAxis = toCanvasX(0);
  if (yAxis >= 0 && yAxis <= h) { ctx2d.beginPath(); ctx2d.moveTo(0, yAxis); ctx2d.lineTo(w, yAxis); ctx2d.stroke(); }
  if (xAxis >= 0 && xAxis <= w) { ctx2d.beginPath(); ctx2d.moveTo(xAxis, 0); ctx2d.lineTo(xAxis, h); ctx2d.stroke(); }

  // Axis Labels & Numeric Tick Marks
  ctx2d.font = '11px monospace';
  ctx2d.fillStyle = '#64748b';

  // X-Axis Numbers
  ctx2d.textAlign = 'center';
  ctx2d.textBaseline = 'top';
  const labelStartY = Math.min(Math.max(yAxis + 6, 8), h - 20);
  const startXNum = Math.floor(minX / step) * step;
  for (let xVal = startXNum; xVal <= maxX; xVal += step) {
    if (Math.abs(xVal) < 1e-6) continue;
    const canvasX = toCanvasX(xVal);
    ctx2d.fillText(Number.isInteger(xVal) ? xVal.toString() : xVal.toFixed(2), canvasX, labelStartY);
  }

  // Y-Axis Numbers
  ctx2d.textAlign = 'right';
  ctx2d.textBaseline = 'middle';
  const labelStartX = Math.min(Math.max(xAxis - 8, 30), w - 8);
  const startYNum = Math.floor(minY / step) * step;
  for (let yVal = startYNum; yVal <= maxY; yVal += step) {
    if (Math.abs(yVal) < 1e-6) continue;
    const canvasY = toCanvasY(yVal);
    ctx2d.fillText(Number.isInteger(yVal) ? yVal.toString() : yVal.toFixed(2), labelStartX, canvasY);
  }

  ctx2d.restore();
  document.getElementById('coordsDisplay').innerText = `Center: (${state.centerX.toFixed(1)}, ${state.centerY.toFixed(1)}) Scale: ${state.zoomScale.toFixed(1)}u`;
}

/**
 * Expression Execution & Plotting Dispatcher
 */
export function drawExpressions() {
  const bounds = getViewportBounds();

  state.expressions.forEach(expr => {
    if (!expr.active || !expr.raw.trim()) return;

    const processed = preprocessKeywords(expr.raw.trim());

    if (processed.startsWith('vector(')) {
      drawVector(processed, expr.color, bounds);
      return;
    }

    if (processed.startsWith('list{')) {
      drawList(processed, expr.color, bounds);
      return;
    }

    if (processed.includes('∫')) {
      drawIntegralExpression(processed, expr.color, bounds);
      return;
    }

    if (processed.includes('=')) {
      // Check for single-variable linear equations (e.g. 2x + 3 = 9)
      const isSimpleLinear = /^[0-9xX\s\+\-\*\/\=]+$/.test(processed) && !processed.includes('y');
      if (isSimpleLinear) {
        try {
          const solved = solveLinearEquation(processed);
          if (typeof solved.value === 'number') {
            drawVerticalLine(solved.value, expr.color, bounds);
            return;
          }
        } catch (e) {}
      }

      const parts = processed.split('=');
      const lhs = parts[0].trim();
      const rhs = parts[1].trim();

      if (lhs === 'y' && !rhs.includes('y') && !rhs.includes('x')) {
        try {
          const yVal = math.evaluate(rhs);
          drawHorizontalLine(yVal, expr.color, bounds);
          return;
        } catch(e){}
      }

      drawImplicitEquation(lhs, rhs, expr.color, bounds);
      return;
    }

    drawExplicitFunction(processed, expr.color, bounds);
  });
}

function drawVector(exprStr, color, bounds) {
  const match = exprStr.match(/vector\(\s*(-?[\d\.\*pi]+)\s*,\s*(-?[\d\.\*pi]+)\s*\)/);
  if (!match) return;

  try {
    const vx = math.evaluate(match[1]);
    const vy = math.evaluate(match[2]);

    const { minX, maxX, minY, maxY } = bounds;
    const w = canvas2d.width, h = canvas2d.height;
    const toCanvasX = (wx) => ((wx - minX) / (maxX - minX)) * w;
    const toCanvasY = (wy) => h - (((wy - minY) / (maxY - minY)) * h);

    const fromX = toCanvasX(0), fromY = toCanvasY(0);
    const toX = toCanvasX(vx), toY = toCanvasY(vy);

    ctx2d.save();
    ctx2d.strokeStyle = color;
    ctx2d.fillStyle = color;
    ctx2d.lineWidth = 3;

    ctx2d.beginPath();
    ctx2d.moveTo(fromX, fromY);
    ctx2d.lineTo(toX, toY);
    ctx2d.stroke();

    const angle = Math.atan2(toY - fromY, toX - fromX);
    const headLen = 12;
    ctx2d.beginPath();
    ctx2d.moveTo(toX, toY);
    ctx2d.lineTo(toX - headLen * Math.cos(angle - Math.PI / 6), toY - headLen * Math.sin(angle - Math.PI / 6));
    ctx2d.lineTo(toX - headLen * Math.cos(angle + Math.PI / 6), toY - headLen * Math.sin(angle + Math.PI / 6));
    ctx2d.closePath();
    ctx2d.fill();

    ctx2d.restore();
  } catch(e){}
}

function drawList(exprStr, color, bounds) {
  const match = exprStr.match(/list\{\s*(.*)\s*\}/);
  if (!match) return;

  try {
    const items = match[1].split(',').map(item => math.evaluate(item.trim()));
    const { minX, maxX, minY, maxY } = bounds;
    const w = canvas2d.width, h = canvas2d.height;
    const toCanvasX = (wx) => ((wx - minX) / (maxX - minX)) * w;
    const toCanvasY = (wy) => h - (((wy - minY) / (maxY - minY)) * h);

    ctx2d.save();
    ctx2d.fillStyle = color;

    items.forEach((val) => {
      const cx = toCanvasX(val);
      const cy = toCanvasY(0);
      ctx2d.beginPath();
      ctx2d.arc(cx, cy, 6, 0, 2 * Math.PI);
      ctx2d.fill();
    });

    ctx2d.restore();
  } catch(e){}
}

function drawIntegralExpression(exprStr, color, bounds) {
  let inner = exprStr.replace(/∫/g, '').trim();
  if (inner.startsWith('(') && inner.endsWith(')')) {
    inner = inner.slice(1, -1);
  }

  const parts = inner.split(',');

  if (parts.length === 3) {
    const funcStr = parts[0].trim();
    try {
      const a = math.evaluate(parts[1].trim());
      const b = math.evaluate(parts[2].trim());
      drawShadedIntegralArea(funcStr, a, b, color, bounds);
    } catch(e){}
  } else {
    const funcStr = parts[0].trim();
    drawUnboundedAntiderivative(funcStr, color, bounds);
  }
}

function drawShadedIntegralArea(funcStr, a, b, color, bounds) {
  const { minX, maxX, minY, maxY } = bounds;
  const w = canvas2d.width, h = canvas2d.height;
  const toCanvasX = (wx) => ((wx - minX) / (maxX - minX)) * w;
  const toCanvasY = (wy) => h - (((wy - minY) / (maxY - minY)) * h);

  const steps = 200;
  const startX = Math.max(a, minX);
  const endX = Math.min(b, maxX);

  if (startX >= endX) return;

  ctx2d.save();
  ctx2d.fillStyle = color + '44';
  ctx2d.beginPath();
  ctx2d.moveTo(toCanvasX(startX), toCanvasY(0));

  for (let i = 0; i <= steps; i++) {
    const xWorld = startX + (i / steps) * (endX - startX);
    try {
      const yWorld = math.evaluate(funcStr, { x: xWorld });
      ctx2d.lineTo(toCanvasX(xWorld), toCanvasY(yWorld));
    } catch(e){}
  }

  ctx2d.lineTo(toCanvasX(endX), toCanvasY(0));
  ctx2d.closePath();
  ctx2d.fill();

  ctx2d.strokeStyle = color;
  ctx2d.lineWidth = 1.5;
  ctx2d.stroke();
  ctx2d.restore();
}

function drawUnboundedAntiderivative(funcStr, color, bounds) {
  const { minX, maxX, minY, maxY } = bounds;
  const w = canvas2d.width, h = canvas2d.height;
  const toCanvasX = (wx) => ((wx - minX) / (maxX - minX)) * w;
  const toCanvasY = (wy) => h - (((wy - minY) / (maxY - minY)) * h);

  const steps = 400;
  const dt = (maxX - minX) / steps;
  
  ctx2d.beginPath();
  ctx2d.strokeStyle = color;
  ctx2d.lineWidth = 2.5;

  let accum = 0;
  let first = true;

  for (let i = 0; i <= steps; i++) {
    const xWorld = minX + i * dt;
    try {
      const fVal = math.evaluate(funcStr, { x: xWorld });
      accum += fVal * dt;

      const canvasX = toCanvasX(xWorld);
      const canvasY = toCanvasY(accum);

      if (first) { ctx2d.moveTo(canvasX, canvasY); first = false; }
      else { ctx2d.lineTo(canvasX, canvasY); }
    } catch(e){ first = true; }
  }
  ctx2d.stroke();
}

function drawHorizontalLine(yVal, color, bounds) {
  const { minY, maxY } = bounds;
  const w = canvas2d.width, h = canvas2d.height;
  const toCanvasY = (wy) => h - (((wy - minY) / (maxY - minY)) * h);

  const canvasY = toCanvasY(yVal);
  ctx2d.save();
  ctx2d.strokeStyle = color;
  ctx2d.lineWidth = 2.5;
  ctx2d.beginPath();
  ctx2d.moveTo(0, canvasY);
  ctx2d.lineTo(w, canvasY);
  ctx2d.stroke();
  ctx2d.restore();
}

function drawVerticalLine(xVal, color, bounds) {
  const { minX, maxX } = bounds;
  const w = canvas2d.width, h = canvas2d.height;
  const toCanvasX = (wx) => ((wx - minX) / (maxX - minX)) * w;

  const canvasX = toCanvasX(xVal);
  ctx2d.save();
  ctx2d.strokeStyle = color;
  ctx2d.lineWidth = 2.5;
  ctx2d.beginPath();
  ctx2d.moveTo(canvasX, 0);
  ctx2d.lineTo(canvasX, h);
  ctx2d.stroke();
  ctx2d.restore();
}

function drawExplicitFunction(rawStr, color, bounds) {
  const { minX, maxX, minY, maxY } = bounds;
  const w = canvas2d.width, h = canvas2d.height;

  let expressionStr = rawStr.replace(/y\s*=\s*/, '').trim();
  let minDomain = -Infinity, maxDomain = Infinity;

  if (expressionStr.includes(',')) {
    const parts = expressionStr.split(',');
    expressionStr = parts[0].trim();
    const rangeMatch = parts[1].trim().match(/(-?[\d\.\*pi]+)\s*<\s*x\s*<\s*(-?[\d\.\*pi]+)/);
    if (rangeMatch) {
      try {
        minDomain = math.evaluate(rangeMatch[1]);
        maxDomain = math.evaluate(rangeMatch[2]);
      } catch(e){}
    }
  }

  ctx2d.beginPath();
  ctx2d.strokeStyle = color;
  ctx2d.lineWidth = 2.5;

  const steps = w < 600 ? 400 : 800;
  let first = true;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const xWorld = minX + t * (maxX - minX);

    if (xWorld < minDomain || xWorld > maxDomain) { first = true; continue; }

    let yWorld;
    try {
      if (expressionStr.includes('d/dx')) {
        yWorld = evaluateDerivative(expressionStr, xWorld);
      } else {
        yWorld = math.evaluate(expressionStr, { x: xWorld });
      }
      if (!isFinite(yWorld) || isNaN(yWorld)) { first = true; continue; }
    } catch (e) { first = true; continue; }

    const canvasX = ((xWorld - minX) / (maxX - minX)) * w;
    const canvasY = h - (((yWorld - minY) / (maxY - minY)) * h);

    if (first) { ctx2d.moveTo(canvasX, canvasY); first = false; }
    else { ctx2d.lineTo(canvasX, canvasY); }
  }
  ctx2d.stroke();
}

function drawImplicitEquation(lhsStr, rhsStr, color, bounds) {
  const { minX, maxX, minY, maxY } = bounds;
  const w = canvas2d.width, h = canvas2d.height;

  const exprCompiled = math.parse(`(${lhsStr}) - (${rhsStr})`).compile();

  const cols = 100, rows = 100;
  const dx = (maxX - minX) / cols;
  const dy = (maxY - minY) / rows;

  const field = new Float32Array((cols + 1) * (rows + 1));
  for (let i = 0; i <= cols; i++) {
    const x = minX + i * dx;
    for (let j = 0; j <= rows; j++) {
      const y = minY + j * dy;
      try {
        field[i * (rows + 1) + j] = exprCompiled.evaluate({ x, y });
      } catch (e) {
        field[i * (rows + 1) + j] = NaN;
      }
    }
  }

  ctx2d.beginPath();
  ctx2d.strokeStyle = color;
  ctx2d.lineWidth = 2.5;

  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const x0 = minX + i * dx, x1 = x0 + dx;
      const y0 = minY + j * dy, y1 = y0 + dy;

      const v0 = field[i * (rows + 1) + j];
      const v1 = field[(i + 1) * (rows + 1) + j];
      const v2 = field[(i + 1) * (rows + 1) + (j + 1)];
      const v3 = field[i * (rows + 1) + (j + 1)];

      const edges = [];
      if (v0 * v1 <= 0) edges.push([x0 + (dx * (-v0)) / (v1 - v0), y0]);
      if (v1 * v2 <= 0) edges.push([x1, y0 + (dy * (-v1)) / (v2 - v1)]);
      if (v2 * v3 <= 0) edges.push([x0 + (dx * (-v3)) / (v2 - v3), y1]);
      if (v3 * v0 <= 0) edges.push([x0, y0 + (dy * (-v0)) / (v3 - v0)]);

      if (edges.length === 2) {
        const px1 = ((edges[0][0] - minX) / (maxX - minX)) * w;
        const py1 = h - (((edges[0][1] - minY) / (maxY - minY)) * h);
        const px2 = ((edges[1][0] - minX) / (maxX - minX)) * w;
        const py2 = h - (((edges[1][1] - minY) / (maxY - minY)) * h);

        ctx2d.moveTo(px1, py1);
        ctx2d.lineTo(px2, py2);
      }
    }
  }
  ctx2d.stroke();
}

function evaluateDerivative(exprStr, xVal) {
  const match = exprStr.match(/d\/dx\s*\((.*)\)/);
  if (!match) return NaN;
  const inner = match[1];
  const h = 0.0001;
  const y1 = math.evaluate(inner, { x: xVal + h });
  const y2 = math.evaluate(inner, { x: xVal - h });
  return (y1 - y2) / (2 * h);
}