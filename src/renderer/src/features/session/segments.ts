const SESSION = Math.random().toString(36).slice(2, 6)
let segCounter = 0

// Id de segmento da telemetria: mic-<sessão>-<n> (voz) ou txt-<sessão>-<n> (texto e frases prontas).
export const newSegId = (kind: 'mic' | 'txt') => `${kind}-${SESSION}-${++segCounter}`
