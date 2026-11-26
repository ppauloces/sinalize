import { toast } from 'sonner'

// Avisos operacionais: erros sempre visíveis; confirmações só para ações do operador.
export const notify = {
  error: (message: string, description?: string) => toast.error(message, { description }),
  success: (message: string, description?: string) => toast.success(message, { description }),
  info: (message: string, description?: string) => toast(message, { description }),
}
