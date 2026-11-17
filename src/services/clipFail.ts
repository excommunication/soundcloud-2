// Причины, по которым запись ролика не началась: короткие коды для тоста и журнала диагностики (без текстов ошибок)
export const CLIP_FAIL_REASONS = ['denied', 'not-found', 'unavailable', 'not-supported', 'aborted', 'no-frames', 'no-canvas', 'recorder', 'unknown'] as const;
export type ClipFailReason = (typeof CLIP_FAIL_REASONS)[number];

export function isClipFailReason(value: unknown): value is ClipFailReason {
    return typeof value === 'string' && (CLIP_FAIL_REASONS as readonly string[]).includes(value);
}
