import { useEffect, useState } from 'react';
import { loadManifest, type Manifest } from '../game/assets';

/** Галерея всех картинок игры (public/assets): открыть /?art. Многокадровые — анимируются. */
export function ArtGallery() {
  const [m, setM] = useState<Manifest | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    void loadManifest().then(setM);
    const t = setInterval(() => setTick((v) => v + 1), 1000 / 8);
    return () => clearInterval(t);
  }, []);
  if (!m) return null;
  return (
    <div style={{ padding: 16, background: '#8fc865', minHeight: '100vh', display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>
      {Object.entries(m).map(([key, s]) => {
        // у людей сбоку анимируем шаг (кадры 1-6)
        const frame = s.frames >= 7 ? 1 + (tick % 6) : s.frames > 1 ? tick % s.frames : 0;
        const k = key.startsWith('building/camp') ? 0.5 : 1;
        return (
          <figure key={key} style={{ margin: 0, textAlign: 'center', font: '11px sans-serif' }}>
            <div
              style={{
                width: s.w * k,
                height: s.h * k,
                backgroundImage: `url(/assets/${s.file})`,
                backgroundSize: `${s.w * s.frames * k}px ${s.h * k}px`,
                backgroundPosition: `${-frame * s.w * k}px 0`,
              }}
            />
            <figcaption>{key}</figcaption>
          </figure>
        );
      })}
    </div>
  );
}
