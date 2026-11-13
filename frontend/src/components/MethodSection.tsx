import type { ValidationData } from '../lib/api'
import { fmtPct } from '../lib/format'
import { ValidationChart } from './Charts'

export function MethodSection({ v }: { v: ValidationData }) {
  const m = v.metrics
  const steps = [
    ['Filtrar', 'Só focos de vegetação com confiança nominal ou alta; fontes industriais e vulcânicas fora.'],
    ['Alinhar', 'Um satélite por sensor com o mesmo horário de passagem (~13h30): Aqua e S-NPP.'],
    ['Calibrar', `Fator VIIRS/MODIS por bloco de 2° e mês do ano, ajustado de ${v.calibration_years[0]} a ${v.calibration_years[1]}.`],
    ['Converter', 'MODIS de 2002 a 2011 × fator = focos equivalentes VIIRS. Daí em diante, VIIRS medido.'],
  ]
  const metrics: [string, string, boolean?][] = [
    ['Correlação mensal', m.corr_harmonized?.toFixed(2) ?? '—'],
    ['Correlação fora da amostra', m.corr_out_of_sample?.toFixed(2) ?? '—'],
    ['Viés MODIS bruto', fmtPct(m.bias_raw_pct)],
    ['Viés após harmonizar', fmtPct(m.bias_harmonized_pct), true],
  ]
  return (
    <>
      <section className="widget">
        <h2 className="w-title">Como MODIS e VIIRS viram uma série só</h2>
        <p className="w-desc">
          O VIIRS enxerga pixels de 375 m e detecta cerca de {m.ratio_viirs_modis?.toLocaleString('pt-BR')}× mais focos que o
          MODIS (1 km) no mesmo fogo. Sem harmonização, a série teria um salto falso em 2012.
        </p>
        <ol className="steps">
          {steps.map(([t, p]) => (
            <li className="step" key={t}>
              <b>{t}</b>
              <p>{p}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="widget">
        <h2 className="w-title">A série convertida contra a medida</h2>
        <p className="w-desc">No período em que os dois sensores voaram juntos, o MODIS harmonizado acompanha o VIIRS.</p>
        <ValidationChart data={v} />
      </section>

      <dl className="widget facts">
        {metrics.map(([label, value, hot]) => (
          <div key={label}>
            <dt className="w-label">{label}</dt>
            <dd className="w-value num" style={hot ? { color: 'var(--accent)' } : undefined}>{value}</dd>
          </div>
        ))}
      </dl>
    </>
  )
}
