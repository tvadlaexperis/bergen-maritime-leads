'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Map as LeafletMap, LayerGroup } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { readWorklist, toggleWorklist } from '@/lib/worklist';

export interface MapCompany {
  orgnr: string;
  name: string;
  lat: number;
  lon: number;
  score: number | null;
  segment: string | null;
  approximate: boolean; // placed by postcode, not street address
  groupSize: number;
}

type BandFilter = 'alle' | '40' | '66';

// Kartverket's grey-tone topographic map (CC BY 4.0) — matches the app's
// muted palette and needs no API key.
const TILES = 'https://cache.kartverket.no/v1/wmts/1.0.0/topograatone/default/webmercator/{z}/{y}/{x}.png';

function bandColor(score: number | null, css: CSSStyleDeclaration): string {
  if (score != null && score >= 66) return css.getPropertyValue('--signal').trim() || '#b45309';
  if (score != null && score >= 40) return css.getPropertyValue('--accent').trim() || '#0e7490';
  return css.getPropertyValue('--text-muted').trim() || '#94a3b8';
}

// Points within `km` of the median position (the Bergen cluster).
function nearMedian(points: MapCompany[], km: number): MapCompany[] {
  if (points.length < 3) return points;
  const mid = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const lat0 = mid(points.map((p) => p.lat));
  const lon0 = mid(points.map((p) => p.lon));
  const kmPerLon = 111 * Math.cos((lat0 * Math.PI) / 180);
  return points.filter((p) => Math.hypot((p.lat - lat0) * 111, (p.lon - lon0) * kmPerLon) <= km);
}

export default function CompanyMap({ companies, segments }: { companies: MapCompany[]; segments: string[] }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const layer = useRef<LayerGroup | null>(null);
  const [segment, setSegment] = useState<string>('ALL');
  const [band, setBand] = useState<BandFilter>('alle');
  const [ready, setReady] = useState(false);

  const shown = useMemo(
    () =>
      companies.filter(
        (c) =>
          (segment === 'ALL' || c.segment === segment) &&
          (band === 'alle' || (c.score ?? -1) >= Number(band)),
      ),
    [companies, segment, band],
  );

  // Leaflet touches `window`, so it's loaded in the browser only.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await import('leaflet');
      if (cancelled || !el.current || map.current) return;
      map.current = L.map(el.current, { zoomControl: true }).setView([60.39, 5.32], 11);
      L.tileLayer(TILES, {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.kartverket.no/">Kartverket</a>',
      }).addTo(map.current);
      layer.current = L.layerGroup().addTo(map.current);
      setReady(true);
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready || !map.current || !layer.current) return;
    (async () => {
      const L = await import('leaflet');
      const css = getComputedStyle(document.documentElement);
      layer.current!.clearLayers();
      // Lowest scores first, so the prioritised leads are drawn on top.
      const ordered = [...shown].sort((a, b) => (a.score ?? -1) - (b.score ?? -1));
      for (const c of ordered) {
        const color = bandColor(c.score, css);
        const marker = L.circleMarker([c.lat, c.lon], {
          radius: c.score != null && c.score >= 66 ? 8 : 6,
          color: '#ffffff',
          weight: 1.5,
          fillColor: color,
          fillOpacity: c.approximate ? 0.45 : 0.9,
        });
        // Built as DOM nodes, not an HTML string: company names come from an
        // external register and shouldn't be interpreted as markup.
        const box = document.createElement('div');
        box.className = 'map-popup';
        const link = document.createElement('a');
        link.href = `/company/${c.orgnr}`;
        link.textContent = c.name;
        link.className = 'link-accent';
        box.appendChild(link);
        const meta = document.createElement('div');
        meta.className = 'muted';
        meta.textContent = [
          c.score != null ? `Lead-score ${c.score}` : 'Ikke scoret',
          c.segment,
          c.groupSize > 1 ? `konsern (${c.groupSize})` : null,
          c.approximate ? 'omtrentlig plassering (postnummer)' : null,
        ]
          .filter(Boolean)
          .join(' · ');
        box.appendChild(meta);
        // Add to / remove from the work list (lib/worklist.ts, same list as
        // the ☆ in the company list).
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-ghost btn-sm map-popup-btn';
        const label = () => {
          const on = readWorklist().has(c.orgnr);
          btn.textContent = on ? '★ På arbeidslisten — fjern' : '☆ Legg til i arbeidslisten';
          btn.setAttribute('aria-pressed', String(on));
        };
        label();
        btn.addEventListener('click', () => {
          toggleWorklist(c.orgnr);
          label();
        });
        box.appendChild(btn);
        marker.bindPopup(box);
        marker.on('popupopen', label); // reflects changes made elsewhere
        marker.addTo(layer.current!);
      }
      // Frame where the companies actually are: a handful registered in Oslo
      // or Svolvær would otherwise zoom the map out to all of Norway. They
      // stay on the map, just outside the initial view.
      const core = nearMedian(ordered, 50);
      if (core.length) {
        map.current!.fitBounds(L.latLngBounds(core.map((c) => [c.lat, c.lon] as [number, number])), {
          padding: [30, 30],
          maxZoom: 13,
        });
      }
    })();
  }, [ready, shown]);

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className={`chip${segment === 'ALL' ? ' active' : ''}`} onClick={() => setSegment('ALL')}>
          Alle segmenter
        </button>
        {segments.map((s) => (
          <button key={s} className={`chip${segment === s ? ' active' : ''}`} onClick={() => setSegment(s)}>
            {s}
          </button>
        ))}
        <span style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 6px' }} aria-hidden="true" />
        {(
          [
            ['alle', 'Alle scorer'],
            ['40', '40+'],
            ['66', '66+ (prioritert)'],
          ] as [BandFilter, string][]
        ).map(([k, label]) => (
          <button key={k} className={`chip${band === k ? ' active' : ''}`} onClick={() => setBand(k)}>
            {label}
          </button>
        ))}
        <span className="muted" style={{ fontSize: '0.78rem', marginLeft: 'auto' }}>
          {shown.length} på kartet
        </span>
      </div>
      <div className="box" style={{ flex: 1, minHeight: 360, padding: 0 }}>
        <div ref={el} style={{ width: '100%', height: '100%', minHeight: 360 }} aria-label="Kart over selskapene" />
      </div>
      <p className="muted" style={{ fontSize: '0.74rem', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <span>
          <span className="map-dot" style={{ background: 'var(--signal)' }} /> 66+ prioritert
        </span>
        <span>
          <span className="map-dot" style={{ background: 'var(--accent)' }} /> 40–65
        </span>
        <span>
          <span className="map-dot" style={{ background: 'var(--text-muted)' }} /> under 40
        </span>
        <span>Blek prikk = omtrentlig plassering (kun postnummer)</span>
      </p>
    </div>
  );
}
