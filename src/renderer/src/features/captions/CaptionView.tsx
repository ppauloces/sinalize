import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { captions } from '../session/session'

// Legenda do Studio: as duas últimas frases finais e o trecho provisório da fala em andamento.
export function CaptionView({ theater }: { theater: boolean }) {
  const { finals, partial, revision } = useStore(captions.store)
  const recent = finals.slice(-2)
  const empty = !recent.length && !partial

  return (
    <div
      key={revision}
      className={cn(
        'relative z-10 flex shrink-0 animate-caption-pop flex-col items-center justify-center gap-0.5 rounded-[14px] border border-white/20 bg-caption text-center shadow-[0_10px_26px_rgb(15_23_42/0.28)] backdrop-blur-lg',
        theater ? 'mx-9 mb-5 min-h-[78px] px-6 py-3.5' : 'mx-4 mb-3.5 min-h-[62px] px-4.5 py-2.5',
      )}
    >
      {empty && <span className="text-sm font-medium text-slate-300">Aguardando fala ou texto para sinalizar...</span>}
      {recent.map((line, i) => {
        const latest = i === recent.length - 1
        return (
          <p
            key={line.seg}
            className={cn(
              'break-words',
              latest ? cn('font-bold text-white', theater ? 'text-[1.42rem]' : 'text-[1.12rem]') : 'text-[0.88rem] font-medium text-slate-300',
              line.state === 'signing' && 'underline decoration-blue-400 decoration-[2.5px] underline-offset-4',
            )}
          >
            {line.text}
            {line.state === 'skipped' && <span className="text-[0.72em] text-red-300"> (só legenda)</span>}
          </p>
        )
      })}
      {partial && <p className="text-[1.06rem] break-words text-blue-300 italic">{partial.text}</p>}
    </div>
  )
}
