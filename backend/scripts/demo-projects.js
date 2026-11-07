// Demo carbon projects for the Fuji testnet, created by seed-demo-projects.js.
//
// Sized as pilots / first monitoring periods so the tokenization deposits fit a
// testnet wallet (deposit = SAL requested x salTokenizationFeePerSAL). Places
// are real Vietnamese districts; the project names, cooperatives and figures are
// illustrative. Each description says it is a demonstration project; keep that
// line so nobody mistakes the demo data for a real issuance.
//
// Fields map to POST /api/projects/metadata. `listing` is what the project
// owner puts on sale after approval (price in AVAX per SAL, min 0.001).
// `mrv` becomes a one-page PDF summary uploaded to IPFS as the MRV document.

const DEMO_NOTE = 'Demonstration project on Avalanche Fuji testnet; figures are illustrative.';

module.exports = [
  {
    key: 'ngoc-hien-mangrove',
    projectName: 'Ngọc Hiển Mangrove Restoration Pilot',
    projectType: 'Mangrove Restoration',
    location: 'Ngọc Hiển, Cà Mau, Vietnam',
    methodology: 'Tidal wetland restoration, VM0033-aligned biomass plots (pilot)',
    monitoringStart: '2026-03-01',
    monitoringEnd: '2026-08-31',
    proposedCO2Kg: 18000,
    description: [
      'Community replanting of 6.5 ha of degraded shrimp-pond embankments with Rhizophora apiculata and Avicennia marina, planted in 2024 and maintained by 14 local households.',
      'Survival is tracked on 12 permanent plots; diameter and height are measured each quarter and converted to above- and below-ground biomass with mangrove allometric equations.',
      'This first monitoring period (Mar to Aug 2026) is estimated at 18 tCO2e of removals after a 20% non-permanence buffer.',
      DEMO_NOTE,
    ].join(' '),
    listing: { amount: 1200, priceAvax: '0.002' },
    mrv: {
      title: 'MRV Summary - Monitoring Period 1',
      rows: [
        ['Restored area', '6.5 ha (planted 2024)'],
        ['Species', 'Rhizophora apiculata, Avicennia marina'],
        ['Permanent plots', '12 plots, measured quarterly'],
        ['Survival rate (month 30)', '82%'],
        ['Gross removals (6 months)', '22.5 tCO2e'],
        ['Non-permanence buffer', '20% (4.5 tCO2e)'],
        ['Net removals claimed', '18.0 tCO2e = 18,000 kg = 1,800 SAL'],
      ],
      notes: [
        'Biomass from plot diameter (DBH) and height using mangrove allometric equations; carbon fraction 0.47; CO2 = C x 44/12.',
        'Field data sheets and plot photos are kept by the community group; a sample is available on request.',
      ],
    },
  },
  {
    key: 'krong-pac-cookstoves',
    projectName: 'Krông Pắc Improved Cookstoves',
    projectType: 'Renewable Energy',
    location: 'Krông Pắc, Đắk Lắk, Vietnam',
    methodology: 'Fuel-wood savings from kitchen performance tests (pilot)',
    monitoringStart: '2026-02-01',
    monitoringEnd: '2026-07-31',
    proposedCO2Kg: 15000,
    description: [
      '25 farming households replaced three-stone fires with improved biomass cookstoves.',
      'Kitchen performance tests at baseline and after three months show average fuel-wood use down 46%, about 1.3 t of wood saved per household over the period.',
      'Emission reductions for Feb to Jul 2026 are estimated at 15 tCO2e, using the non-renewable share of local fuel-wood.',
      DEMO_NOTE,
    ].join(' '),
    listing: { amount: 1000, priceAvax: '0.0015' },
    mrv: {
      title: 'MRV Summary - Monitoring Period 1',
      rows: [
        ['Households', '25 (stoves in use at follow-up: 24)'],
        ['Baseline fuel-wood use', '15.6 kg per household per day (cooking and animal feed)'],
        ['Project fuel-wood use', '8.4 kg per household per day (-46%)'],
        ['Wood saved (181 days, 24 stoves)', 'about 31 t (1.3 t per household)'],
        ['Non-renewable biomass share', '0.28 (demo assumption)'],
        ['Wood emission factor', '1.75 tCO2 per t of wood'],
        ['Emission reductions claimed', '15.0 tCO2e = 15,000 kg = 1,500 SAL'],
      ],
      notes: [
        'Kitchen performance tests: 3-day weighed fuel measurements in a sample of 12 households at baseline and month 3.',
        'Stove usage checked by visit at month 6; one household stopped using the stove and is excluded.',
      ],
    },
  },
  {
    key: 'thot-not-rooftop-solar',
    projectName: 'Thốt Nốt Rice Mill Rooftop Solar',
    projectType: 'Renewable Energy',
    location: 'Thốt Nốt, Cần Thơ, Vietnam',
    methodology: 'Grid electricity displacement, metered generation (pilot)',
    monitoringStart: '2026-06-01',
    monitoringEnd: '2026-08-31',
    proposedCO2Kg: 12000,
    description: [
      'A 60 kWp rooftop photovoltaic system on a family-run rice mill supplies daytime milling load and displaces grid electricity.',
      'Generation is read from a revenue-grade meter; 17.65 MWh were produced from June to August 2026 during the rainy season.',
      'Emission reductions are estimated at 12 tCO2e with a grid emission factor of 0.68 tCO2/MWh (demo assumption).',
      DEMO_NOTE,
    ].join(' '),
    listing: { amount: 800, priceAvax: '0.0025' },
    mrv: {
      title: 'MRV Summary - Monitoring Period 1',
      rows: [
        ['Installed capacity', '60 kWp (rooftop PV)'],
        ['Metered generation', '17.65 MWh (Jun to Aug 2026)'],
        ['Specific yield', 'about 3.2 kWh per kWp per day (rainy season)'],
        ['Grid emission factor', '0.68 tCO2/MWh (demo assumption)'],
        ['Emission reductions claimed', '12.0 tCO2e = 12,000 kg = 1,200 SAL'],
      ],
      notes: [
        'Meter readings taken monthly with photo evidence; inverter logs used as a cross-check.',
        'No double counting: the mill does not sell renewable energy certificates for this output.',
      ],
    },
  },
];
