/**
 * mathengine.js - Advanced Mathematical, Vector, Set & Variable Engine
 */

export const palette = ["#3b82f6", "#ef4444", "#22c55e", "#a855f7", "#eab308"];

export const state = {
  webglEnabled: false,
  gridStyle: 'square',
  expressions: [
    { id: 1, raw: "a = 3", active: true, color: palette[0], min: -10, max: 10, val: 3 },
    { id: 2, raw: "f(x) = sin(a * x)", active: true, color: palette[1] },
    { id: 3, raw: "x + 3 = 7", active: true, color: palette[2] },
    { id: 4, raw: "list{1, 2, 3} - list{3, 4}", active: true, color: palette[3] }
  ],
  userFunctions: {},
  userVariables: {},
  centerX: 0,
  centerY: 0,
  zoomScale: 10
};

export let canvas2d, ctx2d, canvasWebgl, gl;

export function initEngine() {
  canvas2d = document.getElementById('graphCanvas');
  ctx2d = canvas2d.getContext('2d');
  canvasWebgl = document.getElementById('webglCanvas');
  gl = canvasWebgl.getContext('webgl');
}

export function preprocessKeywords(input) {
  let str = input;
  str = str.replace(/\bunion\b/g, '∪');
  str = str.replace(/\b(intersection|intersect)\b/g, '∩');
  str = str.replace(/\b(doublesum|sum2|summation2)\b/g, '∑∑');
  str = str.replace(/\bdot\b/g, '·');
  str = str.replace(/\bcross\b/g, '×');
  str = str.replace(/\bnotequal\b/g, '≠');
  str = str.replace(/\binfinity\b/g, '∞');
  str = str.replace(/\b(doubleintegral|integral2)\b/g, '∬');
  str = str.replace(/\b(tripleintegral|integral3)\b/g, '∭');
  str = str.replace(/\b(lineintegral|contourintegral)\b/g, '∮');
  str = str.replace(/\bintegral\b/g, '∫');
  str = str.replace(/\b(summation|sum)\b/g, '∑');
  return str;
}

export function substituteVariablesAndFunctions(exprStr) {
  let result = exprStr;
  
  // Replace custom variables (constants/sliders)
  for (const [varName, val] of Object.entries(state.userVariables)) {
    const varRegex = new RegExp(`\\b${varName}\\b`, 'g');
    result = result.replace(varRegex, `(${val})`);
  }

  // Replace custom user functions
  for (const [funcName, body] of Object.entries(state.userFunctions)) {
    const regex = new RegExp(`\\b${funcName}\\s*\\(([^)]+)\\)`, 'g');
    result = result.replace(regex, (_, arg) => `(${body.replace(/\bx\b/g, `(${arg})`)})`);
  }

  return result;
}

export function registerFunctionsAndVariables() {
  state.userFunctions = {};
  state.userVariables = {};

  state.expressions.forEach(expr => {
    if (!expr.active || !expr.raw.trim()) return;
    const processed = preprocessKeywords(expr.raw.trim());

    // Variable definition: e.g. a = 3
    const varDefMatch = processed.match(/^([a-zA-Z])\s*=\s*(-?\d+\.?\d*)$/);
    if (varDefMatch) {
      const name = varDefMatch[1];
      if (name !== 'x' && name !== 'y') {
        const val = parseFloat(varDefMatch[2]);
        if (expr.val === undefined) expr.val = val;
        state.userVariables[name] = expr.val;
        return;
      }
    }

    // Function definition: e.g. f(x) = sin(x)
    const funcDefMatch = processed.match(/^([a-zA-Z])\s*\(\s*x\s*\)\s*=\s*(.*)$/);
    if (funcDefMatch) {
      const name = funcDefMatch[1];
      const body = funcDefMatch[2].trim();
      state.userFunctions[name] = body;
    }
  });
}

/**
 * Evaluates constant numerical expressions & solves 1-variable linear equations
 */
export function evaluateOutcome(input) {
  let processed = preprocessKeywords(input.trim());
  if (!processed) return null;

  // Ignore functions or variable assignments
  if (processed.match(/^[a-zA-Z]\s*\(\s*x\s*\)\s*=/)) return null;
  if (processed.match(/^[a-zA-Z]\s*=\s*-?\d+\.?\d*$/)) return null;

  processed = substituteVariablesAndFunctions(processed);

  // Set & Vector evaluation
  const setVecRes = evaluateVectorOrListExpr(processed);
  if (setVecRes) {
    if (setVecRes.type === 'list') return `Outcome: { ${setVecRes.value.join(', ')} }`;
    if (setVecRes.type === 'vector') return `Outcome: vector(${setVecRes.value.join(', ')})`;
    if (setVecRes.type === 'scalar') return `Outcome: ${setVecRes.value}`;
  }

  // Equation solving (e.g., x + 3 = 7)
  if (processed.includes('=') && !processed.startsWith('y=')) {
    const parts = processed.split('=');
    const lhs = parts[0].trim();
    const rhs = parts[1].trim();

    try {
      // Numerical solution search for x in [lhs - rhs = 0]
      const eqStr = `(${lhs}) - (${rhs})`;
      const f = (xVal) => math.evaluate(eqStr, { x: xVal });
      
      let sol = null;
      for (let xTest = -100; xTest <= 100; xTest += 0.5) {
        if (Math.abs(f(xTest)) < 1e-5) { sol = xTest; break; }
      }
      if (sol !== null) return `x = ${Number.isInteger(sol) ? sol : sol.toFixed(4)}`;
    } catch(e) {}
    return null;
  }

  // Pure Numeric calculation
  try {
    const val = math.evaluate(processed);
    if (typeof val === 'number' && !isNaN(val)) {
      return `Result: ${Number.isInteger(val) ? val : val.toFixed(4)}`;
    }
  } catch(e) {}

  return null;
}

/**
 * Advanced Set & Vector Evaluator
 */
export function evaluateVectorOrListExpr(input) {
  let expr = preprocessKeywords(input);

  // Parse lists: list{1, 2, 3}
  expr = expr.replace(/list\s*\{([^}]+)\}/g, (_, items) => {
    const arr = items.split(',').map(x => math.evaluate(substituteVariablesAndFunctions(x.trim())));
    return `[${arr.join(',')}]`;
  });

  // Parse vectors: vector(1, 2)
  expr = expr.replace(/vector\s*\(([^)]+)\)/g, (_, items) => {
    const arr = items.split(',').map(x => math.evaluate(substituteVariablesAndFunctions(x.trim())));
    return `[${arr.join(',')}]`;
  });

  // Set Subtraction (list{1, 2, 3} - list{3, 4})
  if (expr.includes('-') && expr.includes('[')) {
    const parts = expr.split('-').map(p => math.evaluate(substituteVariablesAndFunctions(p.trim())));
    if (Array.isArray(parts[0]) && Array.isArray(parts[1])) {
      const diffSet = parts[0].filter(x => !parts[1].includes(x));
      return { type: 'list', value: diffSet };
    }
  }

  // Set Union (∪)
  if (expr.includes('∪')) {
    const parts = expr.split('∪').map(p => math.evaluate(substituteVariablesAndFunctions(p.trim())));
    if (Array.isArray(parts[0]) && Array.isArray(parts[1])) {
      const unionSet = Array.from(new Set([...parts[0], ...parts[1]]));
      return { type: 'list', value: unionSet };
    }
  }

  // Set Intersection (∩)
  if (expr.includes('∩')) {
    const parts = expr.split('∩').map(p => math.evaluate(substituteVariablesAndFunctions(p.trim())));
    if (Array.isArray(parts[0]) && Array.isArray(parts[1])) {
      const intersectSet = parts[0].filter(x => parts[1].includes(x));
      return { type: 'list', value: Array.from(new Set(intersectSet)) };
    }
  }

  // Vector Dot Product (·)
  if (expr.includes('·')) {
    const parts = expr.split('·').map(p => math.evaluate(substituteVariablesAndFunctions(p.trim())));
    if (Array.isArray(parts[0]) && Array.isArray(parts[1])) {
      const dotProduct = parts[0].reduce((sum, val, idx) => sum + val * (parts[1][idx] || 0), 0);
      return { type: 'scalar', value: dotProduct };
    }
  }

  // Vector Cross Product (×)
  if (expr.includes('×')) {
    const parts = expr.split('×').map(p => math.evaluate(substituteVariablesAndFunctions(p.trim())));
    if (Array.isArray(parts[0]) && Array.isArray(parts[1])) {
      const v1 = parts[0], v2 = parts[1];
      if (v1.length === 2) v1.push(0);
      if (v2.length === 2) v2.push(0);
      const cross = [
        v1[1] * v2[2] - v1[2] * v2[1],
        v1[2] * v2[0] - v1[0] * v2[2],
        v1[0] * v2[1] - v1[1] * v2[0]
      ];
      return { type: 'vector', value: cross };
    }
  }

  return null;
}

export function getViewportBounds() {
  const w = canvas2d.width, h = canvas2d.height;
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

export function calculateDynamicStep(scale) {
  const rawStep = 60 / scale;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const residual = rawStep / mag;
  if (residual < 2) return mag;
  if (residual < 5) return 2 * mag;
  return 5 * mag;
}

export function draw() {
  registerFunctionsAndVariables();
  drawGridAndAxes();
  drawExpressions();
}

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

  ctx2d.strokeStyle = '#475569';
  ctx2d.lineWidth = 1.5;
  const yAxis = toCanvasY(0), xAxis = toCanvasX(0);
  if (yAxis >= 0 && yAxis <= h) { ctx2d.beginPath(); ctx2d.moveTo(0, yAxis); ctx2d.lineTo(w, yAxis); ctx2d.stroke(); }
  if (xAxis >= 0 && xAxis <= w) { ctx2d.beginPath(); ctx2d.moveTo(xAxis, 0); ctx2d.lineTo(xAxis, h); ctx2d.stroke(); }

  ctx2d.font = '11px monospace';
  ctx2d.fillStyle = '#64748b';
  ctx2d.textAlign = 'center';
  ctx2d.textBaseline = 'top';

  const startXNum = Math.floor(minX / step) * step;
  for (let xVal = startXNum; xVal <= maxX; xVal += step) {
    if (Math.abs(xVal) < 1e-6) continue;
    ctx2d.fillText(Number.isInteger(xVal) ? xVal.toString() : xVal.toFixed(2), toCanvasX(xVal), Math.min(Math.max(yAxis + 6, 8), h - 20));
  }

  ctx2d.restore();
  document.getElementById('coordsDisplay').innerText = `Center: (${state.centerX.toFixed(1)}, ${state.centerY.toFixed(1)}) Scale: ${state.zoomScale.toFixed(1)}u`;
}

export function drawExpressions() {
  const bounds = getViewportBounds();

  state.expressions.forEach(expr => {
    if (!expr.active || !expr.raw.trim()) return;

    const raw = expr.raw.trim();
    const processed = substituteVariablesAndFunctions(preprocessKeywords(raw));

    // Render Vectors or Sets
    if (processed.includes('vector') || processed.includes('list') || processed.includes('∪') || processed.includes('∩') || processed.includes('·') || processed.includes('×')) {
      const res = evaluateVectorOrListExpr(processed);
      if (res && res.type === 'vector') renderVector(res.value[0], res.value[1] || 0, expr.color, bounds);
      return;
    }

    // Explicit or Implicit functions
    if (processed.includes('=')) {
      const parts = processed.split('=');
      const lhs = parts[0].trim();
      const rhs = parts[1].trim();

      if (lhs === 'y') { drawExplicitFunction(rhs, expr.color, bounds); return; }
      if (lhs !== 'x' && !lhs.includes('(')) {
        drawImplicitEquation(lhs, rhs, expr.color, bounds);
      }
      return;
    }

    drawExplicitFunction(processed, expr.color, bounds);
  });
}

function renderVector(vx, vy, color, bounds) {
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

  ctx2d.beginPath(); ctx2d.moveTo(fromX, fromY); ctx2d.lineTo(toX, toY); ctx2d.stroke();

  const angle = Math.atan2(toY - fromY, toX - fromX);
  const headLen = 12;
  ctx2d.beginPath();
  ctx2d.moveTo(toX, toY);
  ctx2d.lineTo(toX - headLen * Math.cos(angle - Math.PI / 6), toY - headLen * Math.sin(angle - Math.PI / 6));
  ctx2d.lineTo(toX - headLen * Math.cos(angle + Math.PI / 6), toY - headLen * Math.sin(angle + Math.PI / 6));
  ctx2d.closePath();
  ctx2d.fill();
  ctx2d.restore();
}

function drawExplicitFunction(expressionStr, color, bounds) {
  const { minX, maxX, minY, maxY } = bounds;
  const w = canvas2d.width, h = canvas2d.height;

  ctx2d.beginPath();
  ctx2d.strokeStyle = color;
  ctx2d.lineWidth = 2.5;

  const steps = 600;
  let first = true;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const xWorld = minX + t * (maxX - minX);

    let yWorld;
    try {
      yWorld = math.evaluate(expressionStr, { x: xWorld });
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

  try {
    const exprCompiled = math.parse(`(${lhsStr}) - (${rhsStr})`).compile();
    const cols = 60, rows = 60;
    const dx = (maxX - minX) / cols, dy = (maxY - minY) / rows;

    const field = new Float32Array((cols + 1) * (rows + 1));
    for (let i = 0; i <= cols; i++) {
      const x = minX + i * dx;
      for (let j = 0; j <= rows; j++) {
        const y = minY + j * dy;
        try { field[i * (rows + 1) + j] = exprCompiled.evaluate({ x, y }); } 
        catch (e) { field[i * (rows + 1) + j] = NaN; }
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
          ctx2d.moveTo(px1, py1); ctx2d.lineTo(px2, py2);
        }
      }
    }
    ctx2d.stroke();
  } catch(e){}
}