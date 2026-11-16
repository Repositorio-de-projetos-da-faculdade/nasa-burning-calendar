import type { ValidationData } from '../lib/api'
import { fmtPct } from '../lib/format'
import { ValidationChart } from './Charts'

export function MethodSection({ v }: { v: ValidationData }) {
  const m = v.metrics
  const steps = [
    ['Filter', 'Only vegetation hotspots with nominal or high confidence; industrial and volcanic sources removed.'],
    ['Align', 'One satellite per sensor with the same overpass time (~13:30): Aqua and S-NPP.'],
    ['Calibrate', `VIIRS/MODIS factor per 2° tile and month of the year, fitted from ${v.calibration_years[0]} to ${v.calibration_years[1]}.`],
    ['Convert', 'MODIS from 2002 to 2011 × factor = VIIRS equivalent hotspots. From then on, measured VIIRS.'],
  ]
  const metrics: [string, string, boolean?][] = [
    ['Monthly correlation', m.corr_harmonized?.toFixed(2) ?? '—'],
    ['Out-of-sample correlation', m.corr_out_of_sample?.toFixed(2) ?? '—'],
    ['Raw MODIS bias', fmtPct(m.bias_raw_pct)],
    ['Bias after harmonizing', fmtPct(m.bias_harmonized_pct), true],
  ]
  return (
    <>
      <section className="block">
        <h2 className="w-title">How MODIS and VIIRS become a single series</h2>
        <p className="w-desc">
          VIIRS sees 375 m pixels and detects about {m.ratio_viirs_modis?.toLocaleString('en-US')}× more hotspots than
          MODIS (1 km) on the same fire. Without harmonization, the series would show a false jump in 2012.
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

      <section className="block">
        <h2 className="w-title">The converted series against the measured one</h2>
        <p className="w-desc">Over the period when both sensors flew together, the harmonized MODIS tracks VIIRS.</p>
        <ValidationChart data={v} />
      </section>

      <dl className="block facts">
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
