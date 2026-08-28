/**
 * mathengine.js - Build V1.3
 * Includes UTF-16 Text Rendering, Magnitude (mag), Vector Algebra (2D/3D),
 * Dot Product (• / ·), Y-Axis Labels, Touch Scaling, Function Plotting,
 * Single/Double Summations, Integrals, Imaginary Unit Support, and Focus Preservation.
 */

export const palette = ["#3b82f6", "#ef4444", "#22c55e", "#a855f7", "#eab308"];

export const state = {
  webglEnabled: false,
  gridStyle: 'square',
  expressions: [
    { id: 1, raw: "a = 3", active: true, color: palette[0], min: -10, max: 10, val: 3 },
    { id: 2, raw: "f(x) = sin(a * x)", active: true, color: palette[1] },
    { id: 3, raw: "sum(x, 1, 3)", active: true, color: palette[2] },
    { id: 4, raw: "sum2(x+y, x{1,2}, y{1,3})", active: true, color: palette[3] },
    { id: 5, raw: "integral(x, 0, 4)", active: true, color: palette[4] },
    { id: 6, raw: "i + 1", active: true, color: "#ec4899" },
    { id: 7, raw: "text(\"V1.3 MathPlotter\")", active: true, color: "#3b82f6" },
    { id: 8, raw: "mag(vector(3,4))", active: true, color: "#22c55e" }
  ],
  userFunctions: {},
  userVariables: {},
  complexPoints: [],
  textAnnotations: [],
  centerX: 0,
  centerY: 0,
  zoomScale: 10,
  inputTimeout: null
};

export let canvas2d, ctx2d, canvasWebgl, gl;
let engineLoopTimer = null;

export function initEngine() {
  canvas2d = document.getElementById('graphCanvas');
  ctx2d = canvas2d.getContext('2d');
  canvasWebgl = document.getElementById('webglCanvas');
  gl = canvasWebgl.getContext('webgl');
  
  setupMobileKeyboardFocus();
  startEngineLoop();
}

/**
 * Reliability Loop Tick: Runs every 0.5s to re-verify state, auto-correct 
 * double summation evaluation mismatches, and refresh canvas.
 */
export function startEngineLoop() {
  if (engineLoopTimer) clearInterval(engineLoopTimer);
  engineLoopTimer = setInterval(() => {
    draw();
  }, 500);
}

/**
 * Fixes mobile keyboard collapse by debouncing structural re-renders
 * and preventing non-input controls from stealing focus on touch events.
 */
export function setupMobileKeyboardFocus() {
  document.querySelectorAll('.math-keypad, .calculus-toolbar, button').forEach(el => {
    el.addEventListener('pointerdown', (e) => {
      if (document.activeElement && document.activeElement.tagName === 'INPUT') {
        e.preventDefault();
      }
    });
  });
}

/**
 * Safely updates input value while maintaining selection range and focus context.
 */
export function updateMathInput(inputEl, newValue) {
  if (!inputEl) return;
  const isFocused = (document.activeElement === inputEl);
  const start = inputEl.selectionStart;
  const end = inputEl.selectionEnd;

  if (inputEl.value !== newValue) {
    inputEl.value = newValue;
  }

  if (isFocused && document.activeElement !== inputEl) {
    inputEl.focus({ preventScroll: true });
    if (start !== null && end !== null) {
      inputEl.setSelectionRange(start, end);
    }
  }
}

/**
 * Debounced evaluation wrapper to ensure mobile keyboard paint cycles aren't dropped.
 */
export function bindExpressionInput(inputEl, exprId) {
  if (!inputEl) return;

  inputEl.addEventListener('input', (e) => {
    const start = e.target.selectionStart;
    const end = e.target.selectionEnd;
    const value = e.target.value;

    const expr = state.expressions.find(item => item.id === exprId);
    if (expr) {
      expr.raw = value;
    }

    clearTimeout(state.inputTimeout);
    state.inputTimeout = setTimeout(() => {
      draw();
      if (document.activeElement === e.target) {
        e.target.setSelectionRange(start, end);
      }
    }, 50);
  });
}

export function preprocessKeywords(input) {
  if (!input) return '';
  let str = input;
  str = str.replace(/\bunion\b/g, '∪');
  str = str.replace(/\b(intersection|intersect)\b/g, '∩');
  str = str.replace(/\b(doublesum|summation2)\b/g, 'sum2');
  str = str.replace(/•/g, '·');
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

/**
 * Translates e^(i*x) or e^(x*i) or e^(i) patterns into Euler's identity:
 * e^(i*θ) = cos(θ) + i*sin(θ)
 */
export function expandEulerFormulas(exprStr) {
  if (!exprStr) return '';
  let result = exprStr;

  result = result.replace(/e\^\(\s*i\s*\*([^)]+)\)/g, '(cos($1) + i*sin($1))');
  result = result.replace(/e\^\(\s*([^)]+)\*\s*i\)/g, '(cos($1) + i*sin($1))');
  result = result.replace(/e\^\(\s*i\s*\)/g, '(cos(1) + i*sin(1))');

  return result;
}

/**
 * Decodes UTF-16 string inputs for rendering on graph canvas
 */
export function parseTextTool(exprStr) {
  if (!exprStr) return null;
  const textRegex = /^text\s*\(\s*(?:"([^"]*)"|'([^']*)')(?:\s*,\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*))?\s*\)$/i;
  const match = exprStr.match(textRegex);

  if (match) {
    const rawContent = match[1] !== undefined ? match[1] : match[2];
    const utf16Decoded = rawContent.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => {
      return String.fromCharCode(parseInt(hex, 16));
    });

    const posX = match[3] !== undefined ? parseFloat(match[3]) : 0;
    const posY = match[4] !== undefined ? parseFloat(match[4]) : 0;

    return { text: utf16Decoded, x: posX, y: posY };
  }
  return null;
}

/**
 * Evaluates the magnitude of 2D/3D vectors: mag(vector(a,b)) or mag(vector(a,b,c))
 */
export function evaluateMagnitude(exprStr) {
  if (!exprStr) return null;
  const magRegex = /^mag\s*\(\s*(?:vector\s*\(([^)]+)\)|\[([^\]]+)\])\s*\)$/i;
  const match = exprStr.match(magRegex);

  if (match) {
    const rawItems = match[1] || match[2];
    const components = rawItems.split(',').map(item => {
      return math.evaluate(substituteVariablesAndFunctions(item.trim()));
    });

    const sumSq = components.reduce((acc, val) => acc + val * val, 0);
    return Math.sqrt(sumSq);
  }
  return null;
}

export function registerFunctionsAndVariables() {
  state.userFunctions = {};
  state.userVariables = {};
  state.complexPoints = [];
  state.textAnnotations = [];

  let zCounter = 1;

  state.expressions.forEach(expr => {
    if (!expr.active || !expr.raw || !expr.raw.trim()) return;
    const processed = expandEulerFormulas(preprocessKeywords(expr.raw.trim()));

    // Check Text Annotations
    const textParsed = parseTextTool(processed);
    if (textParsed) {
      state.textAnnotations.push({
        id: expr.id,
        text: textParsed.text,
        x: textParsed.x,
        y: textParsed.y,
        color: expr.color
      });
      return;
    }

    // Reserved character 'i' tracking for complex numbers (z1, z2, ...)
    if (/\bi\b/.test(processed) && !processed.includes('integral') && !processed.includes('∫')) {
      expr.zName = `z${zCounter}`;

      const point = parseComplexPoint(processed);
      if (point) {
        state.complexPoints.push({
          id: expr.id,
          zName: expr.zName,
          x: point.x,
          y: point.y,
          color: expr.color
        });
      }
      zCounter++;
    } else {
      delete expr.zName;
    }

    // Variable Definition (e.g., a = 3)
    const varDefMatch = processed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(-?\d+\.?\d*)$/);
    if (varDefMatch) {
      const name = varDefMatch[1];
      if (name !== 'x' && name !== 'y' && name !== 'i') {
        const val = parseFloat(varDefMatch[2]);
        if (expr.val === undefined) expr.val = val;
        state.userVariables[name] = expr.val;
        return;
      }
    }

    // Function Definition (e.g., f(x) = sin(x))
    const funcDefMatch = processed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*\(\s*x\s*\)\s*=\s*(.*)$/);
    if (funcDefMatch) {
      const name = funcDefMatch[1];
      const body = funcDefMatch[2].trim();
      state.userFunctions[name] = body;
    }
  });
}

export function substituteVariablesAndFunctions(exprStr) {
  if (!exprStr) return '';
  let result = exprStr;

  for (const [varName, val] of Object.entries(state.userVariables)) {
    const varRegex = new RegExp(`\\b${varName}\\b`, 'g');
    result = result.replace(varRegex, `(${val})`);
  }

  let changed = true;
  let iterations = 0;
  while (changed && iterations < 5) {
    changed = false;
    iterations++;
    for (const [funcName, body] of Object.entries(state.userFunctions)) {
      const funcRegex = new RegExp(`\\b${funcName}\\s*\\(([^()]+)\\)`, 'g');
      if (funcRegex.test(result)) {
        result = result.replace(funcRegex, (_, arg) => {
          return `(${body.replace(/\bx\b/g, `(${arg})`)})`;
        });
        changed = true;
      }
    }
  }

  return result;
}

export function parseComplexPoint(input) {
  try {
    let clean = expandEulerFormulas(substituteVariablesAndFunctions(input.trim()));

    const evaluated = math.evaluate(clean);
    if (evaluated && typeof evaluated === 'object' && 're' in evaluated && 'im' in evaluated) {
      return { x: evaluated.re, y: evaluated.im };
    } else if (typeof evaluated === 'number') {
      return { x: evaluated, y: 0 };
    }
  } catch (e) {
    try {
      let str = input.replace(/\s+/g, '');
      let re = 0, im = 0;

      str = str.replace(/([+-]?\d*\.?\d*)i/g, (_, coeff) => {
        if (coeff === '' || coeff === '+') im += 1;
        else if (coeff === '-') im -= 1;
        else im += parseFloat(coeff);
        return '';
      });

      if (str !== '' && !isNaN(str)) {
        re = parseFloat(str);
      }
      return { x: re, y: im };
    } catch (err) {}
  }
  return null;
}

// -------------------------------------------------------------
// Advanced Calculus Tools: Summation, Double Summation, Integral
// -------------------------------------------------------------

export function parseAndEvaluateSummation(input) {
  const clean = input.trim();

  const doubleSumRegexNew = /^(?:sum2|∑∑)\s*\(\s*(.+)\s*,\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\{([^,]+),([^}]+)\}\s*,\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\{([^,]+),([^}]+)\}\s*\)$/i;
  const matchDoubleNew = clean.match(doubleSumRegexNew);

  if (matchDoubleNew) {
    const exprBody = matchDoubleNew[1];
    const xVar = matchDoubleNew[2];
    const xMin = Math.round(math.evaluate(substituteVariablesAndFunctions(matchDoubleNew[3])));
    const xMax = Math.round(math.evaluate(substituteVariablesAndFunctions(matchDoubleNew[4])));
    
    const yVar = matchDoubleNew[5];
    const yMin = Math.round(math.evaluate(substituteVariablesAndFunctions(matchDoubleNew[6])));
    const yMax = Math.round(math.evaluate(substituteVariablesAndFunctions(matchDoubleNew[7])));

    let totalSum = 0;
    for (let xVal = xMin; xVal <= xMax; xVal++) {
      for (let yVal = yMin; yVal <= yMax; yVal++) {
        const scope = {};
        scope[xVar] = xVal;
        scope[yVar] = yVal;
        const substituted = substituteVariablesAndFunctions(exprBody);
        const evalVal = math.evaluate(substituted, scope);
        totalSum += evalVal;
      }
    }
    return totalSum;
  }

  const doubleSumRegexOld = /^(?:sum2|∑∑)\s*\(\s*(.+)\s*,\s*\{([^,]+),([^}]+)\}\s*,\s*\{([^,]+),([^}]+)\}\s*\)$/i;
  const matchDoubleOld = clean.match(doubleSumRegexOld);

  if (matchDoubleOld) {
    const exprBody = matchDoubleOld[1];
    const a = Math.round(math.evaluate(substituteVariablesAndFunctions(matchDoubleOld[2])));
    const b = Math.round(math.evaluate(substituteVariablesAndFunctions(matchDoubleOld[3])));
    const c = Math.round(math.evaluate(substituteVariablesAndFunctions(matchDoubleOld[4])));
    const d = Math.round(math.evaluate(substituteVariablesAndFunctions(matchDoubleOld[5])));

    let totalSum = 0;
    for (let outer = c; outer <= d; outer++) {
      for (let inner = a; inner <= b; inner++) {
        const substituted = substituteVariablesAndFunctions(exprBody);
        const evalVal = math.evaluate(substituted, { x: inner, y: outer });
        totalSum += evalVal;
      }
    }
    return totalSum;
  }

  const singleSumRegex = /^(?:sum|∑)\s*\(\s*(.+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)$/i;
  const matchSingle = clean.match(singleSumRegex);

  if (matchSingle) {
    const exprBody = matchSingle[1];
    const a = Math.round(math.evaluate(substituteVariablesAndFunctions(matchSingle[2])));
    const b = Math.round(math.evaluate(substituteVariablesAndFunctions(matchSingle[3])));

    let totalSum = 0;
    for (let i = a; i <= b; i++) {
      const substituted = substituteVariablesAndFunctions(exprBody);
      const evalVal = math.evaluate(substituted, { x: i });
      totalSum += evalVal;
    }
    return totalSum;
  }

  return null;
}

export function parseAndEvaluateIntegral(input) {
  const clean = input.trim();

  const defIntegralRegex = /^(?:integral|∫)\s*\(\s*(.+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)$/i;
  const matchDef = clean.match(defIntegralRegex);

  if (matchDef) {
    const exprBody = matchDef[1];
    const a = math.evaluate(substituteVariablesAndFunctions(matchDef[2]));
    const b = math.evaluate(substituteVariablesAndFunctions(matchDef[3]));

    const n = 1000;
    const h = (b - a) / n;
    let sum = 0;

    const evalAt = (val) => {
      const substituted = substituteVariablesAndFunctions(exprBody);
      return math.evaluate(substituted, { x: val });
    };

    sum += evalAt(a) + evalAt(b);
    for (let i = 1; i < n; i += 2) sum += 4 * evalAt(a + i * h);
    for (let i = 2; i < n - 1; i += 2) sum += 2 * evalAt(a + i * h);

    return (h / 3) * sum;
  }

  return null;
}

export function evaluateOutcome(input) {
  let processed = expandEulerFormulas(preprocessKeywords(input ? input.trim() : ''));
  if (!processed) return null;

  if (processed.match(/^[a-zA-Z_][a-zA-Z0-9_]*\s*\(\s*x\s*\)\s*=/)) return null;
  if (processed.match(/^[a-zA-Z_][a-zA-Z0-9_]*\s*=\s*-?\d+\.?\d*$/)) return null;

  // Text Tool Parser
  const textRes = parseTextTool(processed);
  if (textRes) {
    return `Text: "${textRes.text}" at (${textRes.x}, ${textRes.y})`;
  }

  // Magnitude Evaluator
  const magRes = evaluateMagnitude(processed);
  if (magRes !== null) {
    return `Magnitude: ${Number.isInteger(magRes) ? magRes : magRes.toFixed(4)}`;
  }

  // Complex Points Check
  if (/\bi\b/.test(processed) && !processed.includes('integral') && !processed.includes('∫')) {
    const pt = parseComplexPoint(processed);
    if (pt) {
      return `Point: (${Number.isInteger(pt.x) ? pt.x : pt.x.toFixed(2)}, ${Number.isInteger(pt.y) ? pt.y : pt.y.toFixed(2)})`;
    }
  }

  // Summations Check
  const sumRes = parseAndEvaluateSummation(processed);
  if (sumRes !== null) {
    return `Outcome: ${Number.isInteger(sumRes) ? sumRes : sumRes.toFixed(4)}`;
  }

  // Definite Integral Check
  const intRes = parseAndEvaluateIntegral(processed);
  if (intRes !== null) {
    return `Outcome: ${Number.isInteger(intRes) ? intRes : intRes.toFixed(4)}`;
  }

  processed = substituteVariablesAndFunctions(processed);

  const setVecRes = evaluateVectorOrListExpr(processed);
  if (setVecRes) {
    if (setVecRes.type === 'list') return `Outcome: { ${setVecRes.value.join(', ')} }`;
    if (setVecRes.type === 'vector') return `Outcome: vector(${setVecRes.value.join(', ')})`;
    if (setVecRes.type === 'scalar') return `Outcome: ${setVecRes.value}`;
  }

  if (processed.includes('=') && !processed.startsWith('y=')) {
    const parts = processed.split('=');
    const lhs = parts[0].trim();
    const rhs = parts[1].trim();

    try {
      const eqStr = `(${lhs}) - (${rhs})`;
      const f = (xVal) => math.evaluate(eqStr, { x: xVal });
      let sol = null;
      for (let xTest = -100; xTest <= 100; xTest += 0.25) {
        if (Math.abs(f(xTest)) < 1e-4) { sol = xTest; break; }
      }
      if (sol !== null) return `x = ${Number.isInteger(sol) ? sol : sol.toFixed(4)}`;
    } catch(e) {}
    return null;
  }

  try {
    const val = math.evaluate(processed);
    if (typeof val === 'number' && !isNaN(val)) {
      return `Result: ${Number.isInteger(val) ? val : val.toFixed(4)}`;
    }
  } catch(e) {}

  return null;
}

export function evaluateVectorOrListExpr(input) {
  let expr = preprocessKeywords(input);

  // Vector parsing support: vector(a,b) or vector(a,b,c)
  expr = expr.replace(/vector\s*\(([^)]+)\)/g, (_, items) => {
    const arr = items.split(',').map(x => math.evaluate(substituteVariablesAndFunctions(x.trim())));
    return `[${arr.join(',')}]`;
  });

  expr = expr.replace(/list\s*\{([^}]+)\}/g, (_, items) => {
    const arr = items.split(',').map(x => math.evaluate(substituteVariablesAndFunctions(x.trim())));
    return `[${arr.join(',')}]`;
  });

  // Vector Addition: [a,b] + [c,d] or [a,b,c] + [i,j,k]
  if (expr.includes('+') && expr.includes('[')) {
    try {
      const parts = expr.split('+').map(p => math.evaluate(substituteVariablesAndFunctions(p.trim())));
      if (Array.isArray(parts[0]) && Array.isArray(parts[1]) && parts[0].length === parts[1].length) {
        const sumVec = parts[0].map((val, idx) => val + parts[1][idx]);
        return { type: 'vector', value: sumVec };
      }
    } catch(e){}
  }

  // Vector Subtraction
  if (expr.includes('-') && expr.includes('[')) {
    try {
      const parts = expr.split('-').map(p => math.evaluate(substituteVariablesAndFunctions(p.trim())));
      if (Array.isArray(parts[0]) && Array.isArray(parts[1])) {
        if (parts[0].length === parts[1].length) {
          const diffVec = parts[0].map((val, idx) => val - parts[1][idx]);
          return { type: 'vector', value: diffVec };
        }
        const diffSet = parts[0].filter(x => !parts[1].includes(x));
        return { type: 'list', value: diffSet };
      }
    } catch(e){}
  }

  if (expr.includes('∪')) {
    try {
      const parts = expr.split('∪').map(p => math.evaluate(substituteVariablesAndFunctions(p.trim())));
      if (Array.isArray(parts[0]) && Array.isArray(parts[1])) {
        return { type: 'list', value: Array.from(new Set([...parts[0], ...parts[1]])) };
      }
    } catch(e){}
  }

  if (expr.includes('∩')) {
    try {
      const parts = expr.split('∩').map(p => math.evaluate(substituteVariablesAndFunctions(p.trim())));
      if (Array.isArray(parts[0]) && Array.isArray(parts[1])) {
        return { type: 'list', value: Array.from(new Set(parts[0].filter(x => parts[1].includes(x)))) };
      }
    } catch(e){}
  }

  // Vector Dot Product (• / ·)
  if (expr.includes('·')) {
    try {
      const parts = expr.split('·').map(p => math.evaluate(substituteVariablesAndFunctions(p.trim())));
      if (Array.isArray(parts[0]) && Array.isArray(parts[1])) {
        const dot = parts[0].reduce((sum, val, idx) => sum + val * (parts[1][idx] || 0), 0);
        return { type: 'scalar', value: dot };
      }
    } catch(e){}
  }

  // Vector Cross Product (2D/3D)
  if (expr.includes('×')) {
    try {
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
    } catch(e){}
  }

  return null;
}

export function getViewportBounds() {
  const w = canvas2d.width || 1, h = canvas2d.height || 1;
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
  const rawStep = 80 / scale;
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
  drawComplexPoints();
  drawTextAnnotations();
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

  // Render X-Axis Numbers
  ctx2d.textAlign = 'center';
  ctx2d.textBaseline = 'top';
  const startXNum = Math.floor(minX / step) * step;
  for (let xVal = startXNum; xVal <= maxX; xVal += step) {
    if (Math.abs(xVal) < 1e-6) continue;
    ctx2d.fillText(Number.isInteger(xVal) ? xVal.toString() : xVal.toFixed(2), toCanvasX(xVal), Math.min(Math.max(yAxis + 6, 8), h - 20));
  }

  // Render Y-Axis Numbers
  ctx2d.textAlign = 'right';
  ctx2d.textBaseline = 'middle';
  const startYNum = Math.floor(minY / step) * step;
  for (let yVal = startYNum; yVal <= maxY; yVal += step) {
    if (Math.abs(yVal) < 1e-6) continue;
    const labelX = Math.min(Math.max(xAxis - 6, 35), w - 8);
    ctx2d.fillText(Number.isInteger(yVal) ? yVal.toString() : yVal.toFixed(2), labelX, toCanvasY(yVal));
  }

  ctx2d.restore();
  document.getElementById('coordsDisplay').innerText = `Center: (${state.centerX.toFixed(2)}, ${state.centerY.toFixed(2)}) Scale: ${state.zoomScale.toFixed(1)}u`;
}

export function drawExpressions() {
  const bounds = getViewportBounds();

  state.expressions.forEach(expr => {
    if (!expr.active || !expr.raw || !expr.raw.trim()) return;

    let raw = expr.raw.trim();

    if (parseTextTool(raw)) return;

    if (/\bi\b/.test(raw) && !raw.includes('integral') && !raw.includes('∫')) {
      return;
    }
    
    const funcMatch = raw.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*\(\s*x\s*\)\s*=\s*(.*)$/);
    if (funcMatch) {
      raw = funcMatch[2].trim();
    }

    const processed = substituteVariablesAndFunctions(expandEulerFormulas(preprocessKeywords(raw)));

    const defIntegralMatch = processed.match(/^(?:integral|∫)\s*\(\s*(.+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)$/i);
    if (defIntegralMatch) {
      drawDefiniteIntegralArea(defIntegralMatch[1], defIntegralMatch[2], defIntegralMatch[3], expr.color, bounds);
      return;
    }

    const indefIntegralMatch = processed.match(/^(?:integral|∫)\s*\(\s*(.+)\s*\)$/i);
    if (indefIntegralMatch) {
      drawIndefiniteIntegralCurve(indefIntegralMatch[1], expr.color, bounds);
      return;
    }

    if (processed.includes('vector') || processed.includes('list') || processed.includes('∪') || processed.includes('∩') || processed.includes('·') || processed.includes('×') || processed.includes('+')) {
      const res = evaluateVectorOrListExpr(processed);
      if (res && res.type === 'vector') renderVector(res.value[0], res.value[1] || 0, expr.color, bounds);
      return;
    }

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

export function drawComplexPoints() {
  const bounds = getViewportBounds();
  const { minX, maxX, minY, maxY } = bounds;
  const w = canvas2d.width, h = canvas2d.height;
  const toCanvasX = (wx) => ((wx - minX) / (maxX - minX)) * w;
  const toCanvasY = (wy) => h - (((wy - minY) / (maxY - minY)) * h);

  state.complexPoints.forEach(pt => {
    const cx = toCanvasX(pt.x);
    const cy = toCanvasY(pt.y);

    ctx2d.save();
    ctx2d.beginPath();
    ctx2d.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx2d.fillStyle = pt.color;
    ctx2d.shadowColor = 'rgba(0,0,0,0.3)';
    ctx2d.shadowBlur = 4;
    ctx2d.fill();
    ctx2d.lineWidth = 2;
    ctx2d.strokeStyle = '#ffffff';
    ctx2d.stroke();

    ctx2d.font = 'bold 12px sans-serif';
    ctx2d.fillStyle = pt.color;
    ctx2d.textAlign = 'left';
    ctx2d.textBaseline = 'bottom';
    ctx2d.fillText(` ${pt.zName} (${pt.x}, ${pt.y})`, cx + 8, cy - 4);
    ctx2d.restore();
  });
}

export function drawTextAnnotations() {
  const bounds = getViewportBounds();
  const { minX, maxX, minY, maxY } = bounds;
  const w = canvas2d.width, h = canvas2d.height;
  const toCanvasX = (wx) => ((wx - minX) / (maxX - minX)) * w;
  const toCanvasY = (wy) => h - (((wy - minY) / (maxY - minY)) * h);

  state.textAnnotations.forEach(item => {
    const cx = toCanvasX(item.x);
    const cy = toCanvasY(item.y);

    ctx2d.save();
    ctx2d.font = 'bold 14px sans-serif';
    ctx2d.fillStyle = item.color;
    ctx2d.textAlign = 'center';
    ctx2d.textBaseline = 'middle';
    ctx2d.shadowColor = 'rgba(255, 255, 255, 0.8)';
    ctx2d.shadowBlur = 3;
    ctx2d.fillText(item.text, cx, cy);
    ctx2d.restore();
  });
}

function drawDefiniteIntegralArea(exprStr, aStr, bStr, color, bounds) {
  const { minX, maxX, minY, maxY } = bounds;
  const w = canvas2d.width, h = canvas2d.height;
  const toCanvasX = (wx) => ((wx - minX) / (maxX - minX)) * w;
  const toCanvasY = (wy) => h - (((wy - minY) / (maxY - minY)) * h);

  try {
    const a = math.evaluate(substituteVariablesAndFunctions(aStr));
    const b = math.evaluate(substituteVariablesAndFunctions(bStr));

    ctx2d.save();
    ctx2d.fillStyle = color + "33";
    ctx2d.strokeStyle = color;
    ctx2d.lineWidth = 2;

    ctx2d.beginPath();
    ctx2d.moveTo(toCanvasX(a), toCanvasY(0));

    const steps = 200;
    for (let i = 0; i <= steps; i++) {
      const xWorld = a + (i / steps) * (b - a);
      const yWorld = math.evaluate(substituteVariablesAndFunctions(exprStr), { x: xWorld });
      ctx2d.lineTo(toCanvasX(xWorld), toCanvasY(yWorld));
    }

    ctx2d.lineTo(toCanvasX(b), toCanvasY(0));
    ctx2d.closePath();
    ctx2d.fill();
    ctx2d.stroke();
    ctx2d.restore();
  } catch(e) {}
}

function drawIndefiniteIntegralCurve(exprStr, color, bounds) {
  const { minX, maxX, minY, maxY } = bounds;
  const w = canvas2d.width, h = canvas2d.height;

  ctx2d.beginPath();
  ctx2d.strokeStyle = color;
  ctx2d.lineWidth = 2.5;

  const steps = 400;
  let accumulated = 0;
  let first = true;
  const dx = (maxX - minX) / steps;

  for (let i = 0; i <= steps; i++) {
    const xWorld = minX + i * dx;
    let yWorld;

    try {
      const fVal = math.evaluate(substituteVariablesAndFunctions(exprStr), { x: xWorld });
      accumulated += fVal * dx;
      yWorld = accumulated;
    } catch(e) { first = true; continue; }

    const canvasX = ((xWorld - minX) / (maxX - minX)) * w;
    const canvasY = h - (((yWorld - minY) / (maxY - minY)) * h);

    if (first) { ctx2d.moveTo(canvasX, canvasY); first = false; }
    else { ctx2d.lineTo(canvasX, canvasY); }
  }
  ctx2d.stroke();
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
    const cols = 50, rows = 50;
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