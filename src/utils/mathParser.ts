/**
 * Safe recursive-descent mathematical expression parser & evaluator (zero eval/Function)
 * plus CSV/TSV parser for chart blocks.
 */

type Token =
  | { type: 'num'; value: number }
  | { type: 'ident'; value: string }
  | { type: 'op'; value: '+' | '-' | '*' | '/' | '^' }
  | { type: 'lparen' }
  | { type: 'rparen' }
  | { type: 'comma' };

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
  tau: Math.PI * 2,
};

const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  sin: (x) => Math.sin(x),
  cos: (x) => Math.cos(x),
  tan: (x) => Math.tan(x),
  asin: (x) => Math.asin(x),
  acos: (x) => Math.acos(x),
  atan: (x) => Math.atan(x),
  sinh: (x) => Math.sinh(x),
  cosh: (x) => Math.cosh(x),
  tanh: (x) => Math.tanh(x),
  sqrt: (x) => Math.sqrt(x),
  cbrt: (x) => Math.cbrt(x),
  abs: (x) => Math.abs(x),
  ln: (x) => Math.log(x),
  log: (x) => Math.log10(x),
  log2: (x) => Math.log2(x),
  exp: (x) => Math.exp(x),
  floor: (x) => Math.floor(x),
  ceil: (x) => Math.ceil(x),
  round: (x) => Math.round(x),
  sign: (x) => Math.sign(x),
  min: (...args) => Math.min(...args),
  max: (...args) => Math.max(...args),
  pow: (a, b) => Math.pow(a, b),
};

function tokenize(raw: string): Token[] {
  // Strip optional "y =" or "f(x) =" prefix
  const cleaned = raw.replace(/^\s*(?:y|f\s*\(\s*x\s*\))\s*=\s*/i, '').trim();
  const tokens: Token[] = [];
  let i = 0;

  while (i < cleaned.length) {
    const ch = cleaned[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let numStr = '';
      let dotCount = 0;
      while (i < cleaned.length && /[0-9.]/.test(cleaned[i])) {
        if (cleaned[i] === '.') dotCount++;
        if (dotCount > 1) throw new Error('Invalid number');
        numStr += cleaned[i++];
      }
      const value = Number(numStr);
      if (Number.isNaN(value)) throw new Error('Invalid number');
      tokens.push({ type: 'num', value });
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let ident = '';
      while (i < cleaned.length && /[a-zA-Z0-9_]/.test(cleaned[i])) {
        ident += cleaned[i++];
      }
      tokens.push({ type: 'ident', value: ident.toLowerCase() });
      continue;
    }
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '^') {
      tokens.push({ type: 'op', value: ch });
      i++;
      continue;
    }
    if (ch === '(') {
      tokens.push({ type: 'lparen' });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'rparen' });
      i++;
      continue;
    }
    if (ch === ',') {
      tokens.push({ type: 'comma' });
      i++;
      continue;
    }
    throw new Error(`Unexpected character "${ch}"`);
  }

  // Insert implicit multiplication: e.g. 2x -> 2*x, 2sin(x) -> 2*sin(x), (x+1)(x-1) -> (x+1)*(x-1), x(x+1) -> x*(x+1)
  const expanded: Token[] = [];
  for (let idx = 0; idx < tokens.length; idx++) {
    const curr = tokens[idx];
    if (idx > 0) {
      const prev = tokens[idx - 1];
      const prevIsVal =
        prev.type === 'num' ||
        prev.type === 'rparen' ||
        (prev.type === 'ident' && !(prev.value in FUNCTIONS));
      const currStartsVal =
        curr.type === 'num' || curr.type === 'lparen' || curr.type === 'ident';
      if (prevIsVal && currStartsVal) {
        expanded.push({ type: 'op', value: '*' });
      }
    }
    expanded.push(curr);
  }
  return expanded;
}

export type CompiledFormula = (x: number) => number;

export function compileFormula(expression: string): { fn: CompiledFormula | null; error: string | null } {
  if (!expression.trim()) {
    return { fn: null, error: 'Enter a formula like y = sin(x)' };
  }
  try {
    const tokens = tokenize(expression);
    if (tokens.length === 0) {
      return { fn: null, error: 'Empty expression' };
    }
    // Validate syntax once at x = 1
    evaluateTokens(tokens, 1);
    return {
      fn: (x: number) => evaluateTokens(tokens, x),
      error: null,
    };
  } catch (err) {
    return {
      fn: null,
      error: err instanceof Error ? err.message : 'Invalid formula',
    };
  }
}

function evaluateTokens(tokens: Token[], xVal: number): number {
  let pos = 0;

  const peek = () => tokens[pos];
  const consume = () => tokens[pos++];

  function parseExpression(): number {
    let left = parseTerm();
    while (peek()?.type === 'op' && (peek() as { value: string }).value.match(/^[+-]$/)) {
      const op = (consume() as { type: 'op'; value: '+' | '-' }).value;
      const right = parseTerm();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  function parseTerm(): number {
    let left = parsePower();
    while (peek()?.type === 'op' && (peek() as { value: string }).value.match(/^[*/]$/)) {
      const op = (consume() as { type: 'op'; value: '*' | '/' }).value;
      const right = parsePower();
      left = op === '*' ? left * right : left / right;
    }
    return left;
  }

  function parsePower(): number {
    const base = parseUnary();
    if (peek()?.type === 'op' && (peek() as { value: string }).value === '^') {
      consume();
      const exp = parsePower(); // right-associative
      return Math.pow(base, exp);
    }
    return base;
  }

  function parseUnary(): number {
    const tok = peek();
    if (tok?.type === 'op' && tok.value === '-') {
      consume();
      return -parseUnary();
    }
    if (tok?.type === 'op' && tok.value === '+') {
      consume();
      return parseUnary();
    }
    return parsePrimary();
  }

  function parsePrimary(): number {
    const tok = peek();
    if (!tok) throw new Error('Unexpected end of expression');

    if (tok.type === 'num') {
      consume();
      return tok.value;
    }

    if (tok.type === 'ident') {
      consume();
      if (tok.value === 'x') return xVal;
      if (tok.value in CONSTANTS) return CONSTANTS[tok.value];
      if (tok.value in FUNCTIONS) {
        if (peek()?.type !== 'lparen') {
          throw new Error(`Expected "(" after ${tok.value}`);
        }
        consume();
        const args: number[] = [];
        if (peek()?.type !== 'rparen') {
          args.push(parseExpression());
          while (peek()?.type === 'comma') {
            consume();
            args.push(parseExpression());
          }
        }
        if (peek()?.type !== 'rparen') {
          throw new Error(`Missing ")" for ${tok.value}`);
        }
        consume();
        return FUNCTIONS[tok.value](...args);
      }
      throw new Error(`Unknown identifier "${tok.value}"`);
    }

    if (tok.type === 'lparen') {
      consume();
      const val = parseExpression();
      if (peek()?.type !== 'rparen') throw new Error('Missing closing ")"');
      consume();
      return val;
    }

    throw new Error('Invalid syntax');
  }

  const result = parseExpression();
  if (pos < tokens.length) {
    throw new Error('Unexpected trailing token');
  }
  return result;
}

export interface ParsedChartDataset {
  labels: string[];
  xValues: number[];
  series: Array<{ name: string; values: number[] }>;
}

/**
 * Parses CSV or tab-separated table text into structured chart series.
 * Supports optional header row and 1+ numeric columns.
 */
export function parseChartCsv(raw: string): ParsedChartDataset {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { labels: [], xValues: [], series: [] };
  }

  const delimiter = lines[0].includes('\t') ? '\t' : ',';
  const rows = lines.map((line) => line.split(delimiter).map((cell) => cell.trim()));

  // Detect header row: if row 0 col 1 is not a valid number, treat row 0 as headers
  const firstRowNumeric = rows[0].length > 1 && !Number.isNaN(Number(rows[0][1]));
  const hasHeader = !firstRowNumeric && rows.length > 1;

  const headers = hasHeader
    ? rows[0]
    : rows[0].map((_, idx) => (idx === 0 ? 'Label' : `Series ${idx}`));

  const dataRows = hasHeader ? rows.slice(1) : rows;
  const colCount = Math.max(2, ...dataRows.map((r) => r.length));

  const labels: string[] = [];
  const xValues: number[] = [];
  const series: Array<{ name: string; values: number[] }> = [];

  for (let c = 1; c < colCount; c++) {
    series.push({
      name: headers[c] || `Series ${c}`,
      values: [],
    });
  }

  dataRows.forEach((row, idx) => {
    const label = row[0] ?? `${idx + 1}`;
    labels.push(label);
    const numX = Number(label);
    xValues.push(Number.isFinite(numX) ? numX : idx + 1);
    for (let c = 1; c < colCount; c++) {
      const parsed = Number(row[c]);
      series[c - 1].values.push(Number.isFinite(parsed) ? parsed : 0);
    }
  });

  return { labels, xValues, series };
}
