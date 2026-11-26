// localStorage pode estar indisponível ou corrompido; leitura nunca derruba a interface.
export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw == null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export function readString(key: string, fallback = '') {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

export function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch (e) {
    console.warn(`Falha ao salvar ${key}:`, e)
  }
}
