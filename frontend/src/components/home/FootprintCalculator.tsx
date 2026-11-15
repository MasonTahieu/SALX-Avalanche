import { useState } from 'react';
import { Link } from 'react-router-dom';
import { product } from '../../config/product';
import { formatNumber } from '../../lib/format';
import './FootprintCalculator.css';

const VIETNAM_GRID_KG_PER_KWH = 0.6187;
const GASOLINE_KG_PER_LITRE = 8.887 / 3.785411784;
const E10_GASOLINE_SHARE = 0.9;
const E10_FOSSIL_KG_PER_LITRE = GASOLINE_KG_PER_LITRE * E10_GASOLINE_SHARE;

const MOTORBIKE_FUEL_USE = { label: 'Fuel use (L/100 km)', initial: 1.72 };
const MOTORBIKE_SOURCES = [
  { label: 'Honda Wave Alpha specifications', href: 'https://www.honda.com.vn/xe-may/san-pham/wave-alpha-phien-ban-co-dien?category=1' },
  { label: 'US EPA gasoline factor', href: 'https://www.epa.gov/greenvehicles/greenhouse-gas-emissions-typical-passenger-vehicle' },
  { label: 'Vietnam E10 fuel guidance', href: 'https://igip.gov.vn/tin-tuc/t43157/xang-e10-chinh-thuc-trien-khai-tren-toan-quoc' },
];

const MOTORBIKE_METHOD = `Distance × fuel use ÷ 100 × ${E10_FOSSIL_KG_PER_LITRE.toFixed(2)} kg fossil CO₂/L of E10 (approximately). The factor applies the EPA gasoline value to the nominal 90% gasoline share of E10. The starting fuel use is the Honda Wave Alpha rating of 1.72 L/100 km. Use your measured fuel use if available. The estimate covers fossil tailpipe CO₂ only.`;

function motorbikeKg(distanceKm: number, litresPer100Km: number) {
  return distanceKm * litresPer100Km / 100 * E10_FOSSIL_KG_PER_LITRE;
}

interface Scenario {
  label: string;
  fields: { label: string; initial: number; whole?: boolean }[];
  scope: string;
  method: string;
  sources: { label: string; href: string }[];
  estimateKg: (values: number[]) => number;
}

const SCENARIOS: Scenario[] = [
  {
    label: 'Personal',
    fields: [{ label: 'Monthly distance (km)', initial: 300 }, MOTORBIKE_FUEL_USE],
    scope: 'Fossil CO₂ from riding a petrol motorbike on E10.',
    method: MOTORBIKE_METHOD,
    sources: MOTORBIKE_SOURCES,
    estimateKg: ([distance, fuelUse]) => motorbikeKg(distance, fuelUse),
  },
  {
    label: 'Office',
    fields: [{ label: 'Monthly electricity use (kWh)', initial: 300 }],
    scope: 'CO₂ from grid electricity. Enter the kWh on your electricity bill.',
    method: `Electricity use × ${VIETNAM_GRID_KG_PER_KWH} kg CO₂/kWh, the published 2024 Vietnam grid factor. The starting value of 300 kWh is an example bill.`,
    sources: [{
      label: 'Vietnam grid factor · Official Letter 11232/BNNMT-BĐKH',
      href: 'https://thuvienphapluat.vn/cong-van/Tai-nguyen-Moi-truong/Cong-van-11232-BNNMT-BDKH-2026-cong-bo-ket-qua-tinh-toan-He-so-phat-thai-cua-luoi-dien-Viet-Nam-2024-729812.aspx',
    }],
    estimateKg: ([kwh]) => kwh * VIETNAM_GRID_KG_PER_KWH,
  },
  {
    label: 'Event',
    fields: [
      { label: 'Motorbike round trips', initial: 50, whole: true },
      { label: 'Average round trip (km)', initial: 16 },
      MOTORBIKE_FUEL_USE,
    ],
    scope: 'Event travel by E10 motorbike only. Count each vehicle once, including shared rides.',
    method: `Total distance is the number of motorbike round trips × the average round-trip distance. ${MOTORBIKE_METHOD}`,
    sources: MOTORBIKE_SOURCES,
    estimateKg: ([trips, distance, fuelUse]) => motorbikeKg(trips * distance, fuelUse),
  },
];

function Estimate({ scenario }: { scenario: Scenario }) {
  const [values, setValues] = useState(() => scenario.fields.map(({ initial }) => String(initial)));
  const amounts = values.map(Number);
  const valid = amounts.every((amount, index) => (
    values[index] !== '' && Number.isFinite(amount) && amount >= 0
    && (!scenario.fields[index].whole || Number.isSafeInteger(amount))
  ));
  const kg = scenario.estimateKg(amounts);
  const sal = Math.ceil(kg / product.fallbackKgPerSAL);
  const hasEstimate = valid && Number.isSafeInteger(sal);
  const displayKg = kg > 0 && kg < 0.01 ? '<0.01' : formatNumber(kg, 2, 'en-US');

  return (
    <div className="footprint__estimate">
      <div className="footprint__inputs">
        <div className="footprint__fields">
          {scenario.fields.map((field, index) => (
            <label key={field.label}>
              <span>{field.label}</span>
              <input
                type="number"
                min={0}
                step={field.whole ? 1 : 'any'}
                inputMode={field.whole ? 'numeric' : 'decimal'}
                value={values[index]}
                onChange={event => {
                  const next = event.target.value;
                  setValues(previous => previous.map((value, i) => i === index ? next : value));
                }}
              />
            </label>
          ))}
        </div>
        <p className="footprint__scope">{scenario.scope}</p>
        <details className="footprint__method">
          <summary>Method and sources</summary>
          <p>{scenario.method}</p>
          <ul>
            {scenario.sources.map(({ label, href }) => (
              <li key={href}><a href={href} target="_blank" rel="noreferrer">{label} ↗</a></li>
            ))}
          </ul>
        </details>
      </div>
      <div className="footprint__result">
        <div aria-live="polite" aria-atomic="true">
          {hasEstimate ? (
            <>
              <p>Estimated emissions</p>
              <strong>{displayKg} <span>kg CO₂</span></strong>
              <p>1 SAL represents {product.fallbackKgPerSAL} kg CO₂e. The suggestion rounds up to whole SAL.</p>
            </>
          ) : (
            <p>Enter valid, non-negative values. The trip count must be a whole number.</p>
          )}
        </div>
        {hasEstimate && sal > 0 && (
          <Link className="footprint__cta home-dc-btn" to={`/marketplace?sal=${sal}`}>
            Find projects for {formatNumber(sal, 0, 'en-US')} SAL ↗
          </Link>
        )}
      </div>
    </div>
  );
}

export function FootprintCalculator() {
  const [selection, setSelection] = useState(0);

  return (
    <section className="home-dc-section footprint" aria-labelledby="footprint-title">
      <div className="footprint__panel">
        <div className="footprint__header">
          <h2 id="footprint-title">Estimate your carbon footprint</h2>
          <div className="footprint__scenarios" role="group" aria-label="Emission scenarios">
            {SCENARIOS.map(({ label }, index) => (
              <button
                key={label}
                type="button"
                aria-pressed={selection === index}
                onClick={() => setSelection(index)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <Estimate key={selection} scenario={SCENARIOS[selection]} />
      </div>
    </section>
  );
}
