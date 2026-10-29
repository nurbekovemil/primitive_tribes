import { useState } from 'react';

export function Lobby({ status, busy, onPlay }: { status: string; busy: boolean; onPlay: (name: string) => void }) {
  const [name, setName] = useState('');
  return (
    <div className="lobby">
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) onPlay(name);
        }}
      >
        <h1>Первобытные племена</h1>
        <p>
          Ты правишь племенем. У тебя есть вождь и его жена у ратуши. Построй кузницу и сделай вождю копьё или топор — с копьём он охотится на оленей и мамонтов; ещё он рубит лес,
          женщина собирает ягоды. Построй хижину, засели в неё семью и рожай детей. Через минуту дети вырастают — найди им пару,
          построй новые хижины — они раздвигают границы и дают место людям, склады — место под добычу — и преврати семью в великое племя.
        </p>
        <p className="warn">Берегись волков и саблезубых тигров — они не подходят только к ратуше племени. Раны сами не заживают: построй кухню и поставь туда повара — раненые придут поесть.</p>
        <input autoFocus maxLength={20} placeholder="Название племени (напр. Огненных)" value={name} onChange={(e) => setName(e.target.value)} />
        <button type="submit" disabled={busy}>
          {busy ? 'Подключение…' : 'Играть'}
        </button>
        <div className="status">{status}</div>
      </form>
    </div>
  );
}
