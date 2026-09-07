import { getFxRates } from '@/lib/fx';

// NOK exchange rates in the header (like ../../Other Projects/minaksjeportal).
// Server component — rendered from cached data; renders nothing if unavailable.
export default async function FxTicker() {
  const rates = await getFxRates();
  if (rates.length === 0) return null;

  return (
    <div className="fx-ticker" aria-label="NOK exchange rates">
      {rates.map((r) => {
        const up = (r.changePct ?? 0) >= 0;
        return (
          <span key={r.code} className="fx-item">
            <span className="fx-code">{r.code}</span>
            <span className="fx-val">{r.value.toFixed(2).replace('.', ',')}</span>
            {r.changePct != null && (
              <span className="fx-chg" data-dir={up ? 'up' : 'down'}>
                {up ? '+' : ''}
                {r.changePct.toFixed(2).replace('.', ',')} %
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}
