/**
 * One layer for every user-facing token number in the console.
 *
 * Token values arrive from the API as exact integers and every surface - the
 * dashboard tiles, both model panels, the request list and the event drawer -
 * renders them through this module, so one switch changes every readout at
 * once and two surfaces can never disagree about how big "1.2B" is.
 *
 * **Two styles.** `en-compact` is the international engineering shorthand
 * (300M, 1.2B), one decimal with trailing zeros trimmed; `full` prints the exact
 * count with digit separators.
 *
 * The layer also owns the *full* form: tooltips and accessible names print the
 * exact count with separators, because a rounded value scanned in a chart is
 * fine while the same rounding in a tooltip would be a wrong number presented
 * as exact.
 */

import type { RollingReadout } from './rollingNumber';

/** The stored preference values. `en-compact` is the default. */
export const TOKEN_NUMBER_STYLES = ['en-compact', 'full'] as const;
export type TokenNumberStyle = (typeof TOKEN_NUMBER_STYLES)[number];

export const DEFAULT_TOKEN_NUMBER_STYLE: TokenNumberStyle = 'en-compact';

/** The stored preference values for the model panels' grouping view. */
export const MODEL_CHART_VIEWS = ['call', 'model'] as const;
export type ModelChartView = (typeof MODEL_CHART_VIEWS)[number];

export const DEFAULT_MODEL_CHART_VIEW: ModelChartView = 'call';

export const DEFAULT_REQUEST_MODEL_ICONS = true;

/**
 * parseRequestModelIcons validates the stored preference for whether model brand
 * icons are shown in the request list.
 */
export function parseRequestModelIcons(raw: unknown): boolean | undefined {
  return typeof raw === 'boolean' ? raw : undefined;
}

/**
 * parseTokenNumberStyle validates a stored preference.
 *
 * The value comes back from a JSON document the browser wrote, so it is input,
 * not state: anything unknown, including a retired style a browser stored
 * earlier, falls back to the default instead of rendering in a style the
 * formatter does not implement.
 */
export function parseTokenNumberStyle(raw: unknown): TokenNumberStyle | undefined {
  return typeof raw === 'string' && (TOKEN_NUMBER_STYLES as readonly string[]).includes(raw)
    ? (raw as TokenNumberStyle)
    : undefined;
}

/**
 * parseModelChartView validates a stored view preference the same way.
 *
 * `call` is the default: a call point is what the operator named and what a
 * client actually requests, and it is the view whose groups match the
 * deployment's own vocabulary rather than the upstream catalogue's.
 */
export function parseModelChartView(raw: unknown): ModelChartView | undefined {
  return typeof raw === 'string' && (MODEL_CHART_VIEWS as readonly string[]).includes(raw)
    ? (raw as ModelChartView)
    : undefined;
}

const COMPACT_EN = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

/**
 * The abbreviation the dashboard's tokens-per-minute tile prints.
 *
 * TPM is a rate rather than a volume, so it does not follow the console's unit
 * style and keeps two decimals instead of one.
 */
const COMPACT_RATE = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 2 });

const FULL = new Intl.NumberFormat('en');

/**
 * formatTokens renders a token count in the chosen unit style.
 *
 * Non-finite input renders as an em dash, the console's shared "no reading"
 * mark, because a NaN in a tile is a data fault rather than a number to round.
 */
export function formatTokens(tokens: number, style: TokenNumberStyle): string {
  if (!Number.isFinite(tokens)) return '—';
  if (style === 'full') return FULL.format(tokens);
  return COMPACT_EN.format(tokens);
}

/**
 * formatTokensFull renders the exact count with digit separators, for tooltips
 * and accessible names where rounding would present an approximate value as
 * the exact one.
 */
export function formatTokensFull(tokens: number): string {
  if (!Number.isFinite(tokens)) return '—';
  return FULL.format(tokens);
}

/**
 * splitFormatted reassembles a formatter's own output as a number plus its unit word.
 *
 * The abbreviation decisions - when to switch unit, how far to round - live in the
 * formatter, and reading them back out of `formatToParts` means a rolling readout
 * animates the digits the formatter chose rather than digits it re-derived.
 */
function splitFormatted(formatter: Intl.NumberFormat, value: number): { number: number; suffix: string } {
  let digits = '';
  let suffix = '';
  for (const part of formatter.formatToParts(value)) {
    if (part.type === 'integer' || part.type === 'fraction') digits += part.value;
    else if (part.type === 'decimal') digits += '.';
    else if (part.type === 'compact') suffix += part.value;
  }
  return { number: Number(digits), suffix };
}

/**
 * resolveCountFlowReadout is the animated form of a plain count - requests, requests
 * per minute - which the console prints as exact grouped digits.
 *
 * A count is not abbreviated and has no unit word, so the readout carries none: the
 * earlier reading and the next one are always the same scale. A missing count has no
 * reading at all, which is the same em dash the printed form uses.
 */
export function resolveCountFlowReadout(value: number | null | undefined): RollingReadout | undefined {
  if (value === null || value === undefined || !Number.isFinite(value)) return undefined;
  return { ...splitFormatted(FULL, value), format: { maximumFractionDigits: 3 } };
}

/**
 * resolveTokenFlowReadout is `formatTokens` as an animated readout.
 *
 * The unit word travels beside the number rather than inside it because
 * `en-compact` prints a different unit at a different magnitude, and that swap is
 * what tells a surface the reading changed scale rather than size.
 */
export function resolveTokenFlowReadout(tokens: number, style: TokenNumberStyle): RollingReadout | undefined {
  if (!Number.isFinite(tokens)) return undefined;
  if (style === 'full') return resolveCountFlowReadout(tokens);
  return { ...splitFormatted(COMPACT_EN, tokens), format: { maximumFractionDigits: 1 } };
}

/**
 * resolveTokenRateFlowReadout is the animated form of a token *rate* - tokens per minute.
 *
 * A rate keeps the compact style, with two decimals, whatever the token style:
 * the token style describes a total, not a rate.
 */
export function resolveTokenRateFlowReadout(value: number | null | undefined): RollingReadout | undefined {
  if (value === null || value === undefined || !Number.isFinite(value)) return undefined;
  return { ...splitFormatted(COMPACT_RATE, value), format: { maximumFractionDigits: 2 } };
}

/**
 * formatTokenRate renders a token rate for a surface that cannot animate - a trend
 * tooltip - in the same compact style the rate's tile prints.
 */
export function formatTokenRate(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return COMPACT_RATE.format(value);
}
